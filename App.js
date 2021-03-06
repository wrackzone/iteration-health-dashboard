var app = null;

Ext.define('CustomApp', {

	extend: 'Rally.app.App',

	componentCls: 'app',

	launch: function() {
		app = this;
		app.numberSprints = app.getSetting("numberSprints");
		app.queryIterations();
	},

	getSettingsFields: function() {
		var values = [
			{
				name: 'numberSprints',
				xtype: 'rallytextfield',
				label : "Number of sprints to report on."
			},
			{
				name: 'showOnlyTeams',
				xtype: 'rallycheckboxfield',
				label : "Only show projects with at least one team member."
			},
			{
				name: 'showTeamMembers',
				xtype: 'rallycheckboxfield',
				label : "Show team members column."
			},

			{
				name: 'showAcceptanceRateMetric',
				xtype: 'rallycheckboxfield',
				label : "Show Accepted .v. Commit %"
			},
			{
				name: 'showImprovementRateMetric',
				xtype: 'rallycheckboxfield',
				label : "Show Improvement work as % of Scope"
			},
			{
				name: 'showChurnRateMetric',
				xtype: 'rallycheckboxfield',
				label : "Show Churn Ratio (std dev of scope divided by average daily scope)"
			},
			{
				name: 'showPercentEstimatedMetric',
				xtype: 'rallycheckboxfield',
				label : "Show Percentage of stories with a plan estimate metric"
			},
			{
				name: 'showTaskChurnRateMetric',
				xtype: 'rallycheckboxfield',
				label : "Show Task Churn Ratio (std dev of task scope divided by average daily scope)"
			},
			{
				name: 'showDailyInProgressMetric',
				xtype: 'rallycheckboxfield',
				label : "Show average daily percentage of work that is In-Progress"
			},
			{
				name: 'showBurnDownResiduals',
				xtype: 'rallycheckboxfield',
				label : "Show burn down residuals (values closer to 1 indicate burndown closer to ideal)"
			},
			{
				name: 'useLateAcceptanceRate',
				xtype: 'rallycheckboxfield',
				label : "use Late Accepted value for Acceptance Ratio"
			},
			{
				name: 'commitAcceptRatio',
				xtype: 'rallytextfield',
				label : "Target accepted .v. committed percent"
			},
			{
				name: 'continuousImprovementRangeMin',
				xtype: 'rallytextfield',
				label: 'Continuous Improvement Range Min'
			},
			{
				name: 'continuousImprovementRangeMax',
				xtype: 'rallytextfield',
				label: 'Continuous Improvement Range Max'
			}
		];

		_.each(values,function(value){
			value.labelWidth = 250;
			value.labelAlign = 'left';
		});

		return values;
	},

	config: {
		defaultSettings : {
			numberSprints : 4,
			showOnlyTeams : false,
			showTeamMembers : true,
			showAcceptanceRateMetric : true,
			showImprovementRateMetric : false,
			showChurnRateMetric : true,
			showPercentEstimatedMetric : true,
			showTaskChurnRateMetric : true,
			showDailyInProgressMetric : true,
			showBurnDownResiduals : true,
			commitAcceptRatio : 75,
			continuousImprovementRangeMin : 5,
			continuousImprovementRangeMax : 10,
			useLateAcceptanceRate : true
		}
	},

	/*
		queryIteration retrieves all iterations in scope that ended before today and after one
		year ago.
	*/
	queryIterations : function() {
		var today = new Date();
		var lastYear = new Date();
		lastYear.setDate(today.getDate()-365);
		var todayISO = Rally.util.DateTime.toIsoString(today, false);
		var lastYearISO = Rally.util.DateTime.toIsoString(lastYear, false);

		var configs = [
			{
				model  : "Iteration",
				fetch  : ['Name', 'ObjectID', 'Project', 'StartDate', 'EndDate' ],
				filters: [
					{ property : 'EndDate', operator: "<=", value: todayISO },
					{ property : 'EndDate', operator: ">=", value: lastYearISO }
				],

				sorters: [
					{
						property: 'EndDate',
						direction: 'ASC'
					}
				]
			}
		];

		async.map( configs, app.wsapiQuery, function(error,results) {
		/*
			We group the iterations by project (team), and then get metrics for the last four iterations
			for each team.
		*/
			var iterationsRaw = results[0];
			var prjRefs = _.map(results[0],function(iter)
			{
				return iter.get("Project").ObjectID;
			});
			var uniqPrjRefs = _.uniq(prjRefs);

			var querConfigs = _.map(uniqPrjRefs,function(p) {
				return{
					model:"Project",
					fetch: ["TeamMembers","Name"],
					filters: [{property:"ObjectID",value:p}]
				};
			});
			async.map(querConfigs, app.wsapiQuery, function(err, results) {

				var flatTM = _.flatten(results);
				var flatNotEmptyTM = _.filter(flatTM, function(prj) { return app.getSetting("showOnlyTeams") === false || prj.get("TeamMembers").Count > 0; });

				var uniqPrjIdTM = _.map(flatNotEmptyTM, function(val) {
								return val.get("ObjectID");
				});

				var inerNoEmptyTM = _.filter(iterationsRaw, function(iter) { return _.contains(uniqPrjIdTM, iter.get("Project").ObjectID );});

				// var groupedByProject = _.groupBy(inerNoEmptyTM,function(r) { return r.get("Project").Name;});
				var groupedByProject = _.groupBy(inerNoEmptyTM,function(r) { return r.get("Project").ObjectID;});
				var teams = _.map(_.keys(groupedByProject),function(pid) {
					return _.find(flatNotEmptyTM,function(p) {
						return p.get("ObjectID")==pid;
					});
				});
				var teamLastIterations = _.map( _.values(groupedByProject), function(gbp) {
					return _.last(gbp,app.numberSprints);
				});          

				/*
				Get the iteration data for each set of up to 4 iterations.
				*/
				async.map( teamLastIterations, app.teamData, function(error,results) {
					app.teamResults = _.map(results, function(result,i) {
						return {
							team : teams[i].get("Name"),
							summary : _.merge(results[i][0],results[i][1],results[i][2])
						};
					});

					// get list of team members, 
					async.map(teams, 
						function(proj,callback) {
							proj.getCollection("TeamMembers").load({
								fetch:true,
								callback : function(recs,operation,success) {
									callback(null,recs);
								}
							});
						},
						function(err,teamMemberships) {
							_.each(app.teamResults,function(t,x) {
								t.teamMembers = teamMemberships[x];
							});
							app.addTable(app.teamResults);
						}
					);
					// create the table with the summary data.
					
				});
			});
		});
	},


	/*
		Called for each team to return the iteration and improvements data records
	*/
	teamData : function( iterations, callback) {
		app.iterationsData( iterations, function(x,iterationResults) {
			app.improvementsData( iterations,function(err,improvementResults) {
				app.allIterationItems( iterations, function(err,allIterationItems) {
					callback(null,[iterationResults,improvementResults,allIterationItems]);	
				});
			});
		});
	},

	allIterationItems : function( iterations, callback) {

		var storyConfigs = _.map( iterations, function(iteration) {
			return {
				model  : "HierarchicalRequirement",
				fetch  : ['ObjectID','PlanEstimate','Name','FormattedID','Project','ScheduleState'],
				filters: [ {
						property : 'Iteration.ObjectID',
						operator: "=",
						value: iteration.get("ObjectID")
					}
				]
			};
		});

		var defectConfigs = _.map( iterations, function(iteration) {
			return {
				model  : "Defect",
				fetch  : ['ObjectID','PlanEstimate','Name','FormattedID','Project','ScheduleState'],
				filters: [ {
						property : 'Iteration.ObjectID',
						operator: "=",
						value: iteration.get("ObjectID")
					}
				]
			};
		});

		async.map( storyConfigs, app.wsapiQuery, function(error,storyResults) {
			async.map( defectConfigs, app.wsapiQuery, function(error,defectResults) {
				var allData = [];
				_.each(iterations,function(iteration,x) {
					var iterationArtifacts = storyResults[x].concat(defectResults[x]);
					
					// total individual values for each artifact in iteration.
					var allIterationData = {
						totalScope : _.reduce(iterationArtifacts, function(memo,r) {
							return memo + (r.get("PlanEstimate")!==null  ? r.get("PlanEstimate") : 0);
						},0),
						lateAccepted : _.reduce(iterationArtifacts, function(memo,r) {
							return memo + app.acceptedValue(r);
						},0),
						percentEstimated : iterationArtifacts.length > 0 ? 
							(	_.filter(iterationArtifacts,function(artifact) {
									return (artifact.get("PlanEstimate") !== null && artifact.get("PlanEstimate") > 0);
								}).length / iterationArtifacts.length * 100) : 0
					};
					allData.push(allIterationData);
				});
				callback(null,allData);
			});
		});
	},

	improvementsData : function( iterations, callback) {

		var configs = _.map( iterations, function(iteration) {
			return {
				model  : "HierarchicalRequirement",
				fetch  : ['ObjectID','PlanEstimate','Name','FormattedID','Project','ScheduleState'],
				filters: [ {
						property : 'Feature.Name',
						operator: "contains",
						value: 'Continuous Improvement'
					},
					{
						property : 'Iteration.ObjectID',
						operator: "=",
						value: iteration.get("ObjectID")
					},
					{
						property : 'ScheduleState',
						operator: "=",
						value: "Accepted"
					}
				]
			};
		});

		async.map( configs, app.wsapiQuery, function(error,results) {
			var allData = [];
			_.each(results,function(result){
				var improvementRec = {
					totalImprovementPoints : _.reduce(result,function(memo,r){
						return memo + app.acceptedValue(r);
					},0)
				};
				allData.push(improvementRec);
			});
			
			callback(null,allData);
		});

	},

	acceptedValue : function(story) {
		var accepted = story.get("ScheduleState") === "Accepted" || story.get("ScheduleState") == "Released";
		var val = accepted && (story.get("PlanEstimate")!==null) ? story.get("PlanEstimate") : 0;
		return val;
	},

	/*
		Retrieves the iteration metrics (iterationcumulativeflowdata) for each set of iterations
	*/
	iterationsData : function( iterations, callback) {
		// create a set of wsapi query configs from the iterations

		var configs = _.map( iterations, function(iteration) {
			return {
				model  : "IterationCumulativeFlowData",
				fetch  : ['CardEstimateTotal','CardState','CreationDate','TaskEstimateTotal','CardToDoTotal'],
				filters: [ Ext.create('Rally.data.wsapi.Filter', {
					property : 'IterationObjectID',
					operator: "=",
					value: iteration.get("ObjectID")
				})]
			};
		});

		// once we have the metrics data we do some gymnastics to calculate the committed and accepted values
		async.map( configs, app.wsapiQuery, function(error,results) {
			var summaries = [];
			_.each(results,function(iterationRecords, index) {
				if(iterationRecords.length >0) {
					// group the metrics by date,
					var groupedByDate = _.groupBy(iterationRecords,function(ir) { return ir.get("CreationDate");});

					var churnRatio = app.churnRatio(_.values(groupedByDate));
					var taskChurnRatio = app.taskChurnRatio(_.values(groupedByDate));
					var stdResiduals = app.burnDownResiduals(_.values(groupedByDate));
					var iterationDates = _.keys(groupedByDate);
					var dailyInProgressRate = app.dailyInProgressRate(_.values(groupedByDate));
					iterationDates = _.sortBy(iterationDates,function(d) {
						return Rally.util.DateTime.fromIsoString(d);
					});
					var firstDayRecs = groupedByDate[_.first(iterationDates)];
					var lastDayRecs = groupedByDate[_.last(iterationDates)];
					if((firstDayRecs.length>0) && (lastDayRecs.length>0))
					{
						var committed = _.reduce( firstDayRecs, function(memo,val) {
										return memo + (val.get("CardEstimateTotal") !== null ? val.get("CardEstimateTotal") : 0);
						}, 0 );
						var accepted = _.reduce( lastDayRecs, function(memo,val) {
							var estimate = val.get("CardEstimateTotal");
							var done = val.get("CardState") === "Accepted" || val.get("CardState") === "Released";
							
							return memo + (( done && !_.isNull(estimate) ) ? estimate : 0);
						}, 0 );
						
						summaries.push( {
							project : iterations[index].get("Project"),
							iteration : iterations[index].get("Name"),
							iteration_rec : iterations[index],
							id : firstDayRecs[0].get("IterationObjectID"),
							committed : Math.round(committed),
							accepted : Math.round(accepted),
							churnRatio : churnRatio,
							taskChurnRatio : taskChurnRatio,
							dailyInProgressRate : dailyInProgressRate,
							stdResiduals : stdResiduals
						});
					}
				}
			});
			callback(null,summaries);
		});
	},


	// Returns the std dev when passed an array of arrays of daily cumulative flow recs
	churnRatio : function ( arrDailyRecs ) {

		var dailyTotals = _.map( arrDailyRecs, function(recs) {
			return _.reduce(recs,function(memo,r) { return memo + r.get("CardEstimateTotal");},0);
		});
		var dailyAverage = _.mean(dailyTotals);
		var stdDev = _.stdDeviation(dailyTotals);
		return dailyAverage > 0 ? Math.round((stdDev / dailyAverage) *100) : 0;
	},

	// Returns the std dev when passed an array of arrays of daily cumulative flow recs
	taskChurnRatio : function ( arrDailyRecs ) {

		var dailyTotals = _.map( arrDailyRecs, function(recs) {
			return _.reduce(recs,function(memo,r) { return memo + r.get("TaskEstimateTotal");},0);
		});
		var dailyAverage = _.mean(dailyTotals);
		var stdDev = _.stdDeviation(dailyTotals);
		return dailyAverage > 0 ? Math.round((stdDev / dailyAverage) *100) : 0;

	},

	burnDownResiduals : function ( arrDailyRecs ) {

		var keys = _.keys(arrDailyRecs);

		var firstDayEstimate = _.reduce( arrDailyRecs[_.first(keys)], function(memo,rec) {
			return memo + rec.get("TaskEstimateTotal");
		},0);

		var ideal = _.map(keys,function(k,i) {
			return Math.round(firstDayEstimate - (i*(firstDayEstimate/(keys.length-1))));
		});
		var todo = _.map(keys,function(k,i) {
			return Math.round(_.reduce( arrDailyRecs[k], function(memo,rec) {
				return memo + rec.get("CardToDoTotal");
			},0));
		});
		var estimate = _.map(keys,function(k,i) {
			return Math.round(_.reduce( arrDailyRecs[k], function(memo,rec) {
				return memo + rec.get("TaskEstimateTotal");
			},0));
		});

		var rec = { ideal : ideal, todo : todo, estimate : estimate };
		var rs = app.rSquared(rec);
		return rs;

	},

	rSquared : function(burndown) {

	var squaredError = _.map( burndown.ideal, function(ideal,i) {
		var diff = ideal - burndown.todo[i];
		return diff * diff;
	});

	var mean = _.average(burndown.todo);
	var diffFromMean = _.map( burndown.todo, function(todo,i) {
		var diff = todo - mean;
		return diff * diff;
	});

	var sse = _.sum(squaredError);
	var sst = _.sum(diffFromMean);
	var rs = sst !== 0 ?  1 - (Math.round( (sse/sst) *100 ) / 100) : 0;
	return rs;

	},

	// average daily in progress rate (based on points)
	dailyInProgressRate : function( arrDailyRecs ) {

		var dailyInProgressRates = _.map( arrDailyRecs, function(recs) {
			var dailyTotal = _.reduce(recs,function(memo,r) { return memo + r.get("CardEstimateTotal");},0);
			var dailyInProgress = _.reduce(recs,function(memo,r) { 
				return memo + (r.get("CardState") === "In-Progress" ? r.get("CardEstimateTotal") : 0);
			},0);
			return (dailyTotal > 0 ? (( dailyInProgress / dailyTotal ) * 100 ) : 0);
		});
		return _.mean(dailyInProgressRates);

	},

	defineChartColumns : function() {

		app.teamMembersColumn = {
			text: 'Team Members', 
			dataIndex: 'teamMembers', 
			renderer : app.renderTeamMembers,
			width : 150, 
			align : "left",
			tdCls: 'wrap'
		};

		app.acceptanceRateColumn = {
			text: '% Accepted Chart', 
			dataIndex: 'summary', 
			renderer : app.renderAcceptedChart,
			width : 150, 
			align : "center"
		};

		app.improvementRateColumn = { 
			text: '% Improvement Chart', 
			dataIndex: 'summary', 
			renderer : app.renderImprovementChart,
			width : 150, 
			align : "center" 
		};

		app.churnRateColumn = { 
			text: 'Churn Ratio Chart', 
			dataIndex: 'summary', 
			renderer : app.renderChurnChart,
			width : 150, 
			align : "center" 
		};

		app.percentEstimatedColumn = { 
			text: 'Percent Estimated Chart', 
			dataIndex: 'summary', 
			renderer : app.renderPercentEstimatedChart,
			width : 150, 
			align : "center" 
		};

		app.taskChurnRateColumn = { 
			text: 'Task Churn Rate', 
			dataIndex: 'summary', 
			renderer : app.renderTaskChurnRateChart,
			width : 150, 
			align : "center" 
		};

		app.dailyInProgressColumn = { 
			text: 'Average Daily In-Progress % Rate', 
			dataIndex: 'summary', 
			renderer : app.renderDailyInProgressChart,
			width : 150, 
			align : "center" 
		};

		app.burnDownResiduals = { 
			text: 'Task Burndown Residuals', 
			dataIndex: 'summary', 
			renderer : app.renderBurnDownResiduals,
			width : 150, 
			align : "center" 
		};

	},

	addTable : function(teamResults) {

		app.defineChartColumns();

		var columnCfgs = [
			{ text: 'Team', dataIndex: 'team', renderer : app.renderTeamName },
			{ text: 'Last 4 Sprints', dataIndex: 'summary', renderer : app.renderSummaries, width : 250 }
		];
		if (app.getSetting("showTeamMembers")===true)
			columnCfgs.push(app.teamMembersColumn);
		if (app.getSetting("showAcceptanceRateMetric")===true)
			columnCfgs.push(app.acceptanceRateColumn);
		if (app.getSetting("showImprovementRateMetric")===true)
			columnCfgs.push(app.improvementRateColumn);
		if (app.getSetting("showChurnRateMetric")===true)
			columnCfgs.push(app.churnRateColumn);
		if (app.getSetting("showPercentEstimatedMetric")===true)
			columnCfgs.push(app.percentEstimatedColumn);
		if (app.getSetting("showTaskChurnRateMetric")===true)
			columnCfgs.push(app.taskChurnRateColumn);
		if (app.getSetting("showDailyInProgressMetric")===true)
			columnCfgs.push(app.dailyInProgressColumn);
		if (app.getSetting("showBurnDownResiduals")===true)
			columnCfgs.push(app.burnDownResiduals);

		var grid = Ext.create('Rally.ui.grid.Grid', {
			store: Ext.create('Rally.data.custom.Store', {
				data: teamResults
			}),
			columnCfgs: columnCfgs
		});

		app.add(grid);

	},


	renderTeamName: function(value, metaData, record, rowIdx, colIdx, store, view) {
		// return "Team " + rowIdx;
		return value;
	},

	renderTeamMembers: function(value, metaData, record, rowIdx, colIdx, store, view) {
		// return "Team " + rowIdx;
		var userValue = function(m) {
			var d = m.get("DisplayName");
			return ((d!==null&&d!=="") ? d : m.get("UserName"));
		};

		if (value.length > 7)
			return value.length + " Team Members";

		return _.map(value,function(teamMember,i) {
			return userValue(teamMember);
		}).join("<br/>");
		// + ( i < (value.length-1) ? "<br/>" : "")
	},

	renderAcceptedChart: function(value, metaData, record, rowIdx, colIdx, store, view) {

		var acceptedToken = app.getSetting('useLateAcceptanceRate') === true ? 'lateAccepted' : 'accepted';

		var data = _.map( value, function (v,i) {
			
			var drec =  {
				acceptedPercent : v.committed > 0 ? Math.round((v[acceptedToken] / v.committed) * 100) : 0,
				targetPercent : app.getSetting("commitAcceptRatio"),
				index : i+1
			};
			return drec;
		});

		var id = app.renderChart(record,data,['index','acceptedPercent','targetPercent'],'AcceptedPercent');
		var prj = value[0].project.ObjectID;
		var iteration = _.last(value).id;
		var href = "https://rally1.rallydev.com/#/"+prj+"/oiterationstatus?iterationKey="+iteration;
		return "<a id='" + id + "'href="+href+" target=_blank></a>";
	},

	renderImprovementChart: function(value, metaData, record, rowIdx, colIdx, store, view) {
		var id = app.renderChart(record,value,['index','improvementPercent'],'ImprovementRatio');
		return "<div id='"+id+"'></div>";
	},

	renderChurnChart: function(value, metaData, record, rowIdx, colIdx, store, view) {
		var id = app.renderChart(record,value,['index','churnRatio'],'ChurnRatio');
		return "<div id='"+id+"'></div>";
	},

	renderTaskChurnRateChart: function(value, metaData, record, rowIdx, colIdx, store, view) {
		var id = app.renderChart(record,value,['index','taskChurnRatio'],'TaskChurnRatio');
		return "<div id='"+id+"'></div>";
	},

	renderPercentEstimatedChart: function(value, metaData, record, rowIdx, colIdx, store, view) {
		var id = app.renderChart(record,value,['index','percentEstimated'],'PercentEstimated');
		return "<div id='"+id+"'></div>";
	},

	renderDailyInProgressChart: function(value, metaData, record, rowIdx, colIdx, store, view) {
		var id = app.renderChart(record,value,['index','dailyInProgressRate'],'DailyInProgressRate');
		return "<div id='"+id+"'></div>";
	},

	renderBurnDownResiduals: function(value, metaData, record, rowIdx, colIdx, store, view) {
		var id = app.renderChart(record,value,['index','stdResiduals'],'stdResiduals');
		return "<div id='"+id+"'></div>";
	},


	renderChart : function( record, value, fields, chartName ) {

		var data = _.map( value, function (v,i) {
			var d = {
				index : i+1
			};
			_.each(fields,function(f) { 
				if (f!=="index")
					d[f] = _.isUndefined(v[f]) ? 0 : v[f];
			});
			return d;
		});

		var chartStore = Ext.create('Ext.data.JsonStore', {
			fields: fields,
			data: data
		});

		var chartConfig = app.createChartConfig(fields);

		var id = Ext.id();
		Ext.defer(function (id,chartStore,chartConfig,record) {
			record.chartConfig = _.isUndefined(record.chartConfig) ? {} : record.chartConfig;
			record.chart = _.isUndefined(record.chart) ? {} : record.chart;
			record.chartConfig[chartName] = chartConfig;
			record.chartConfig[chartName].renderTo = id;
			record.chartConfig[chartName].store = chartStore;
			if (record.chart[chartName]===undefined)
				record.chart[chartName] = Ext.create('Ext.chart.Chart', chartConfig);
		}, 50, undefined, [id,chartStore,chartConfig,record]);

		return id;
	},

	// assumes the category series is the first element eg. ['index','acceptedPercent'] etc.
	createChartConfig : function(series) {

		return {
			style : {
				// backgroundColor : 'red'
			},
			width: 100,
			height: 100,
			axes: [{
				type: 'Numeric',
				position: 'left',
				fields: [series[1]],
				label: {
					renderer: Ext.util.Format.numberRenderer('0,0')
				},
				grid: true
			}, {
				type: 'Category',
				position: 'bottom',
				fields: [series[0]]
			}],
			series: _.map(_.rest(series),function(s,x) {
				var config =  {
					type: 'line',
					highlight: {
						size: 2,
						radius: 2
					},
					axis: 'left',
					xField: series[0],
					yField: s
				};
				if (x>0) {
					config.markerConfig = { 
						type: 'circle',
						size: 1,
						radius: 0
					};
				}
				return config;
			})
		};
	},

	LinkRenderer: function(value, metaData, record, rowIdx, colIdx, store, view) {
		var workspace=app.getContext().getProject().ObjectID;
		var lastSprintId= _.last(value).id;
		return "<a href='https://rally1.rallydev.com/#/"+workspace+"/oiterationstatus?iterationKey="+lastSprintId+"' target='_blank'>Last one</a>";
	},

	renderSummaries: function(value, metaData, record, rowIdx, colIdx, store, view) {

		var endDateF = function(iteration) {
			var d = Rally.util.DateTime.fromIsoString(iteration.iteration_rec.raw.EndDate);
			return Ext.Date.format(d, 'm/d');
		};

		var s = 
		"<table class='iteration-summary'>" +
			"<th>" +
			_.map(value,function(v){ return '<td><i>'+endDateF(v)+'</i></td>';}).join('') +
			"</th>"+
			"<tr><td><i>Committed</i></td>" +
			_.map(value,function(v){ return '<td>'+Math.round(v.committed)+'</td>'; }).join('') +
			"</tr>"+
			// "<tr><td><i>Accepted</i></td>" +
			"<tr><td><i>Accepted In Sprint</i></td>" +
			_.map(value,function(v){ return '<td>'+Math.round(v.accepted)+'</td>'; }).join('') +
			"</tr>" +
			// "<tr><td><i>Late Accepted</i></td>" +
			"<tr><td><i>Total Accepted</i></td>" +
			_.map(value,function(v){ return '<td>'+Math.round(v.lateAccepted)+'</td>'; }).join('') +
			"</tr></table>";
		return s;
	},

	wsapiQuery : function( config , callback ) {
		Ext.create('Rally.data.WsapiDataStore', {
			autoLoad : true,
			limit : "Infinity",
			model : config.model,
			fetch : config.fetch,
			filters : config.filters,
			sorters : config.sorters,
			listeners : {
				scope : this,
				load : function(store, data) {
					callback(null,data);
				}
			}
		});
	}

});