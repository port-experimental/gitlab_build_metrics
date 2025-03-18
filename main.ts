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
          membership: true,
        });

        console.log(`Found ${projects.length} projects`);

        for (const project of projects) {
          console.log(`Processing project: ${project.name}`);
          
          const metrics = {
            totalProdDeploy: 0,
            totalProdDeploySuccess: 0,
            totalProdDeployFailed: 0,
            lastMonthProdDeploy: 0,
            lastMonthProdDeploySuccess: 0,
            lastMonthProdDeployFailed: 0,
          };

          // Get pipelines for each project
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
            
            // Get jobs for each pipeline
            const jobs = await api.Jobs.all(project.id, { pipelineId: pipeline.id });

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

            if (new Date(pipeline.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
              metrics.lastMonthProdDeploy += success + failed;
              metrics.lastMonthProdDeploySuccess += success;
              metrics.lastMonthProdDeployFailed += failed;
            }
          }

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