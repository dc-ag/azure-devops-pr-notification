import * as core from "@actions/core";
import * as github from "@actions/github";
import * as azdev from "azure-devops-node-api";
import {
  WorkItem,
  WorkItemExpand,
} from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";
import { IWorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import fetch from "node-fetch";

// eslint-disable-next-line require-jsdoc
export async function run() {
  try {
    const repoToken = core.getInput("repo-token", { required: true });
    const devOpsOrg: string = core.getInput("devops-organization", {
      required: true,
      trimWhitespace: true,
    });
    const azToken: string = core.getInput("devops-pat", {
      required: true,
      trimWhitespace: true,
    });
    const failOnError: boolean = core.getBooleanInput("fail-on-error");
    const devOpsIdRegex: string = core.getInput("devops-card-id-regex", {
      required: true,
      trimWhitespace: true,
    });
    const setToState: string = core.getInput("set-to-state", {
      trimWhitespace: true,
    });
    const addPullRequestLink: boolean = core.getBooleanInput("add-pr-link");

    const prRequestId = github.context.issue.number;
    const prOrg = github.context.repo.owner;
    const prRepo = github.context.repo.repo;

    const repoClient = github.getOctokit(repoToken);
    const prResponse = await repoClient.rest.pulls.get({
      owner: prOrg,
      repo: prRepo,
      pull_number: prRequestId,
    });

    const title = prResponse.data.title;
    const description = prResponse.data.body ?? "";

    const rExp: RegExp = new RegExp(devOpsIdRegex);
    let workItemId: number | null = null;
    // Match from title
    console.log("Try matching work item id from title ...");
    let regResult = title.match(rExp);
    if (null !== regResult && regResult.length >= 2) {
      workItemId = parseInt(regResult[1]);
      console.log(`... success! Work item id = ${workItemId}`);
    } else {
      console.log("... failed!");
    }

    // Match from description if not found in title
    if (null === workItemId) {
      console.log("Try matching work item id from description ...");
      regResult = description.match(rExp);
      if (null !== regResult && regResult.length >= 2) {
        workItemId = parseInt(regResult[1]);
        console.log(`... success! Work item id = ${workItemId}`);
      } else {
        console.log("... failed!");
      }
    }

    if (null === workItemId) {
      console.log("Work item id couldn't be matched!");
      if (failOnError) {
        core.setFailed("Failed to match work item id");
      }
      return;
    }

    console.log("Initialize dev ops connection ...");
    let azWorkApi: IWorkItemTrackingApi;

    try {
      let orgUrl = `https://dev.azure.com/${devOpsOrg}`;
      let authHandler = azdev.getPersonalAccessTokenHandler(azToken);
      let azWebApi = new azdev.WebApi(orgUrl, authHandler);
      azWorkApi = await azWebApi.getWorkItemTrackingApi();
    } catch (exception) {
      console.log(`... failed! ${exception}`);
      if (failOnError) {
        core.setFailed("Failed connection to dev ops!");
      }
      return;
    }
    console.log("... success!");

    console.log("Check if work item exists ...");
    let workItem: WorkItem | null = null;
    let hasError = false;
    await azWorkApi
      .getWorkItem(workItemId, undefined, undefined, WorkItemExpand.All)
      .then((wi: WorkItem) => {
        workItem = wi;
      })
      .catch((error) => {
        if (error.statusCode === 401) {
          hasError = true;
          console.log(
            "Missing authorization (PAT needs to have 'Work Items - Read, write, & manage')."
          );
          if (failOnError) {
            core.setFailed(
              "Missing authorization (PAT needs to have 'Work Items - Read, write, & manage')."
            );
          }
        } else {
          throw error;
        }
      });
    if (hasError) {
      return;
    }
    if (null === workItem) {
      console.log(`... failed! Work item with id ${workItemId} does not exist`);
      if (failOnError) {
        core.setFailed(`Work item with id ${workItemId} does not exist!`);
      }
      return;
    }
    console.log("... success!");

    hasError = false;
    if (addPullRequestLink) {
      console.log("Adding PR link to card ...");
      const dataProviderUrls = `https://dev.azure.com/${devOpsOrg}/_apis/Contribution/dataProviders/query?api-version=7.1-preview.1`;
      try {
        const dataProviderResponse = await fetch(dataProviderUrls, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${Buffer.from(":" + azToken).toString(
              "base64"
            )}`,
            Accept: "application/json",
          },
          body: JSON.stringify({
            context: {
              properties: {
                workItemId: workItemId,
                urls: [
                  `https://github.com/${prOrg}/${prRepo}/pull/${prRequestId}`,
                ],
              },
            },
            contributionIds: ["ms.vss-work-web.github-link-data-provider"],
          }),
        });
        if (dataProviderResponse.status === 401) {
          throw new Error(
            "Missing authorization (Linking PRs to cards requires full access for the PAT)."
          );
        }
        const responseData = await dataProviderResponse.json();
        const internalRepoId: string | null =
          responseData.data["ms.vss-work-web.github-link-data-provider"]
            .resolvedLinkItems[0].repoInternalId ?? null;
        if (null === internalRepoId || internalRepoId.length === 0) {
          throw new Error("Internal repo url couldn't be resolved");
        }

        const artifactUrl = `vstfs:///GitHub/PullRequest/${internalRepoId}%2F${prRequestId}`;

        try {
          await azWorkApi.updateWorkItem(
            {},
            [
              {
                op: "add",
                path: "/relations/-",
                value: {
                  rel: "ArtifactLink",
                  url: artifactUrl,

                  attributes: {
                    name: "GitHub Pull Request",
                    comment: `Pull Request ${prRequestId}`,
                  },
                },
              },
            ],
            workItemId
          );
        } catch (exception: any) {
          const errorMessage = exception.toString();
          if (-1 !== errorMessage.indexOf("already exists")) {
            console.log("... (already exists) ...");
          } else {
            throw exception;
          }
        }
      } catch (exception) {
        hasError = true;
        console.log(`... failed! ${exception}`);
        if (failOnError) {
          core.setFailed(`Failed to link PR to work item!`);
          return;
        }
      }
      if (!hasError) {
        console.log("... success!");
      }
    }

    hasError = false;
    if ("" !== setToState) {
      console.log("Setting work item state ...");
      try {
        await azWorkApi.updateWorkItem(
          {},
          [
            {
              op: "replace",
              path: "/fields/System.State",
              value: setToState,
            },
          ],
          workItemId
        );
      } catch (exception) {
        hasError = true;
        console.log(`... failed! ${exception}`);
        if (failOnError) {
          core.setFailed(`Failed to set new state for work item!`);
          return;
        }
      }
      if (!hasError) {
        console.log("... success!");
      }
    }
  } catch (error) {
    console.error(error);
    core.setFailed("Unknown error" + error);
    throw error;
  }
}

run();
