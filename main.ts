import { Command } from 'commander';
import { upsertEntity } from './src/port_client';
import { Gitlab } from '@gitbeaker/rest';

if (process.env.GITHUB_ACTIONS !== 'true') {
    require('dotenv').config();
}

async function main() {
  const PORT_CLIENT_ID = process.env.PORT_CLIENT_ID;
  const PORT_CLIENT_SECRET = process.env.PORT_CLIENT_SECRET;
  const GITLAB_TOKEN = process.env.GITLAB_TOKEN;

  if (!PORT_CLIENT_ID || !PORT_CLIENT_SECRET || !GITLAB_TOKEN) {
    console.log('Please provide env vars PORT_CLIENT_ID, PORT_CLIENT_SECRET, and GITLAB_TOKEN');
    process.exit(0);
  }

  try {
    const program = new Command();

    program
      .name('gitlab-sync')
      .description('CLI to pull metrics from Gitlab to Port');

    program
      .command('calculate-metrics')
      .description('Send pipeline metrics to Port')
      .action(async () => {
        console.log('Calculating metrics...');
        const api = new Gitlab({
          token: GITLAB_TOKEN,
        });

        // Get all projects
        console.log('Fetching projects...');
        const projects = await api.Projects.all({
          orderBy: 'last_activity_at',
          sort: 'desc',
          membership: true,
        });

        console.log(`Found ${projects.length} projects`);

        for (const project of projects) {
          console.log(`Processing project: ${project.name}`);
          
          const metrics = {
            // Production Deployment Metrics
            totalProdDeploy: 0,
            totalProdDeploySuccess: 0,
            totalProdDeployFailed: 0,
            lastMonthProdDeploy: 0,
            lastMonthProdDeploySuccess: 0,
            lastMonthProdDeployFailed: 0,

            // Project Pipeline Run 
            totalPipelineRun: 0,
            totalPipelineRunSuccess: 0,
            totalPipelineRunFailed: 0,
            lastMonthPipelineRun: 0,
            lastMonthPipelineRunSuccess: 0,
            lastMonthPipelineRunFailed: 0,


            // Project Jobs Run 
            totalJobsRun: 0,
            totalJobRunSuccess: 0,
            totalJobRunFailed: 0,
            lastMonthJobRun: 0,
            lastMonthJobRunSuccess: 0,
            lastMonthJobRunFailed: 0,

            // Project Test Run
            totalTestRun: 0,
            totalTestRunSuccess: 0,
            totalTestRunFailed: 0,
            totalTestRunSkipped: 0,
            totalTestRunError: 0,
            lastMonthTestRun: 0,
            lastMonthTestRunSuccess: 0,
            lastMonthTestRunFailed: 0,
            lastMonthTestRunSkipped: 0,
            lastMonthTestRunError: 0,

            // Pipeline Trigger Metrics
            pipelineTriggers: {
              "api": 0,
              "chat": 0,
              "external": 0,
              "external_pull_request_event": 0,
              "merge_request_event": 0,
              "ondemand_dast_scan": 0,
              "ondemand_dast_validation": 0,
              "parent_pipeline": 0,
              "pipeline": 0,
              "push": 0,
              "schedule": 0,
              "security_orchestration_policy": 0,
              "trigger": 0,
              "web": 0,
              "webide": 0,
            },

            // MR Metrics
            totalMergedMR: 0,
            lastMonthMergedMR: 0,
            avgAllTimeReviewTime: 0,
            avgLastMonthReviewTime: 0,
          };
          // Pipeline Metrics
          let pipelines: any[] = [];
          try {
            pipelines = await api.Pipelines.all(project.id);
          } catch (error) {
            console.error(`Error fetching pipelines for project ${project.name}:`, error);
            continue;
          }

          console.log(`Found ${pipelines.length} pipelines for project ${project.name}`);

          for (const pipeline of pipelines) {
            console.log(`  Pipeline #${pipeline.id} - Status: ${pipeline.status}`);
            
            // Increment the trigger type
            metrics.pipelineTriggers[pipeline.source]++;

            // Increment the pipeline run metrics
            metrics.totalPipelineRun++;
            if (pipeline.status === 'success') {
              metrics.totalPipelineRunSuccess++;
            } else if (pipeline.status === 'failed') {
              metrics.totalPipelineRunFailed++;
            }

            // Get jobs for each pipeline
            const jobs = await api.Jobs.all(project.id, { pipelineId: pipeline.id });

            // Calculate Production Deployment Metrics
            const { success, failed } = jobs.reduce((acc, job) => {
              if (job.name.includes('deploy') || job.name.includes('prod-preview-deploy') || job.name.includes('prod:deploy')) {
                if (job.status === 'success') {
                  acc.success++;
                } else if (job.status === 'failed') {
                  acc.failed++;
                }
              }
              return acc;
            }, { success: 0, failed: 0 });

            metrics.totalProdDeploy += success + failed;
            metrics.totalProdDeploySuccess += success;
            metrics.totalProdDeployFailed += failed;

            // Calculate Pipeline Jobs Run Metrics

            const { success: jobSuccess, failed: jobFailed } = jobs.reduce((acc, job) => {
              if (job.status === 'success') {
                acc.success++;
              } else if (job.status === 'failed') {
                acc.failed++;
              }
              return acc;
            }, { success: 0, failed: 0 });

            metrics.totalJobsRun += jobSuccess + jobFailed;
            metrics.totalJobRunSuccess += jobSuccess;
            metrics.totalJobRunFailed += jobFailed;
            
            // Test results
            const testReportSummary = await api.Pipelines.showTestReportSummary(project.id, pipeline.id);

            metrics.totalTestRun += testReportSummary.total.count;
            metrics.totalTestRunSuccess += testReportSummary.total.success;
            metrics.totalTestRunFailed += testReportSummary.total.failed;
            metrics.totalTestRunSkipped += testReportSummary.total.skipped;
            metrics.totalTestRunError += testReportSummary.total.error;

            
            if (new Date(pipeline.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
              metrics.lastMonthProdDeploy += success + failed;
              metrics.lastMonthProdDeploySuccess += success;
              metrics.lastMonthProdDeployFailed += failed;

              metrics.lastMonthJobRun += jobSuccess + jobFailed;
              metrics.lastMonthJobRunSuccess += jobSuccess;
              metrics.lastMonthJobRunFailed += jobFailed;

              metrics.lastMonthPipelineRun += 1;
              metrics.lastMonthPipelineRunSuccess += pipeline.status === 'success' ? 1 : 0;
              metrics.lastMonthPipelineRunFailed += pipeline.status === 'failed' ? 1 : 0;

              metrics.lastMonthTestRun += testReportSummary.total.count;
              metrics.lastMonthTestRunSuccess += testReportSummary.total.success;
              metrics.lastMonthTestRunFailed += testReportSummary.total.failed;
              metrics.lastMonthTestRunSkipped += testReportSummary.total.skipped;
              metrics.lastMonthTestRunError += testReportSummary.total.error;
            }
          }

          // MR Metrics
          let mergeRequests: any[] = [];
          try {
            mergeRequests = await api.MergeRequests.all({
              projectId: project.id,
              orderBy: 'created_at',
              sort: 'desc',
            });
          } catch (error) {
            console.error(`Error fetching pipelines for project ${project.name}:`, error);
            continue;
          }

          let allTimeTotal = 0;
          let lastMonthTotal = 0;
          for (const mergeRequest of mergeRequests) {
            if (mergeRequest.merged_at) {
              metrics.totalMergedMR++;
              allTimeTotal += mergeRequest.merged_at - mergeRequest.created_at;
              if (new Date(mergeRequest.merged_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
                metrics.lastMonthMergedMR++;
                lastMonthTotal += mergeRequest.merged_at - mergeRequest.created_at;
              }
            }
          }
          metrics.avgAllTimeReviewTime = allTimeTotal / metrics.totalMergedMR;
          metrics.avgLastMonthReviewTime = lastMonthTotal / metrics.lastMonthMergedMR;
          console.log(metrics);
          await upsertEntity('gitlab_project', project.id.toString(), project.name, metrics, {});
        }
      });

    await program.parseAsync();
  } catch (error) {
    console.error('Error:', error);
  }
}

main();