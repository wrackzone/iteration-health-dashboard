Iteration Health Dashboard
==========================

Barry Mullan (2015)

## Overview

This app provides key iteration health metrics for Rally teams. 

![screenshot](https://raw.githubusercontent.com/wrackzone/iteration-health-dashboard/master/screen-shot.png)

A visual representation of key agile health indicators

* **% Accepted** 
How much work is being committed to each sprint, how much is accepted and how much is accepted during the iteration and how much is accepted after the iteration ("late" acceptance).

Y-Axis is in % where 100% means that all work committed in that sprint was accepted. Values closer to 100% are better.

* **Churn Ratio**
A measure of how much the sprint backlog changes during the sprint, it is impacted by stories being moved into the sprint, out of the sprint or if estimates change. It is calculated using the standard deviation of the daily sprint scope totals divided by the average daily scope. 

Y-Axis is a numeric score. A value of zero means there was no change in scope during the sprint. Lower values are better.

* **Percent Estimated**
What percentage of the sprint backlog was estimated at the beginning of the sprint.
Y-Axis is a % where 100% means that all stories in the sprint had an estimate on the first day of the sprint. Values closer to 100% are better.

* **Task Churn Ratio**
A measure of how much the task backlog changes during the sprint.
Y-Axis is a numeric score. Values closer to zero mean that there was less change in the total task hours scope during the iteration. As a best practices task hours are estimated at the beginning of the sprint. Values closer to zero are better.

* **Average Daily In Progress %**
The average daily work in progress rate. 

Y-Axis is a % which represents the percentage of stories that were, on average, in the In-Progress state for any day in the sprint. Lower values are better.

* **Task Burndown Residuals**
A measure of how closely the task burndown follows the ideal burndown; the value is 1 if the actual burndown is exactly equal to the ideal burndown.

Y-Axis is a numberic score. Values closer to 1 are better.



## License

AppTemplate is released under the MIT license.  See the file [LICENSE](./LICENSE) for the full text.

##Documentation for SDK

You can find the documentation on our help [site.](https://help.rallydev.com/apps/2.0rc3/doc/)
