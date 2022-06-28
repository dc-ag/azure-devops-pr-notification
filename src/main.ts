import * as core from "@actions/core";
import * as github from "@actions/github";
import * as azdev from "azure-devops-node-api";
import {
  WorkItem,
  WorkItemExpand,
} from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";
import { IWorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import fetch from "node-fetch";

const relArticaftLink = "ArtifactLink";
const relNameGitHubPr = "GitHub Pull Request";
const msGitHubLinkDataProviderLink =
  "ms.vss-work-web.github-link-data-provider";
const dataProviderUrlBase = `https://dev.azure.com/%DEVOPS_ORG%/_apis/Contribution/dataProviders/query?api-version=7.1-preview.1`;
const artifactLinkGitHubPrRegex =
  "/GitHub/PullRequest/([0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12})%2F([0-9]*)";

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
    const devOpsIdRegex: string = core.getInput("devops-work-item-regex", {
      required: true,
      trimWhitespace: true,
    });
    const setToState: string = core.getInput("set-to-state", {
      trimWhitespace: true,
    });
    const dontSetStateWhilePrsOpen: boolean = core.getBooleanInput(
      "dont-set-state-while-prs-open"
    );
    const addPullRequestLink: boolean = core.getBooleanInput("add-pr-link");

    const dataProviderUrl = dataProviderUrlBase.replace(
      "%DEVOPS_ORG%",
      devOpsOrg
    );

    const rExp: RegExp = new RegExp(devOpsIdRegex);
    let workItemId: number | null = null;

    const prRequestId = github.context.issue.number;
    const prRepo = github.context.repo.repo;
    const prOrg = github.context.repo.owner;

    const triggerFromPr = undefined !== prRequestId;
    if (triggerFromPr) {
      console.log("Trigger from PR.");
      const repoClient = github.getOctokit(repoToken);
      const prResponse = await repoClient.rest.pulls.get({
        owner: prOrg,
        repo: prRepo,
        pull_number: prRequestId,
      });

      const branchName = prResponse.data.head.ref;
      const title = prResponse.data.title;
      const description = prResponse.data.body ?? "";

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

      // Match from branch name if not found in title and description
      if (null === workItemId) {
        console.log("Try matching work item id from branch name ...");
        regResult = branchName.match(rExp);
        if (null !== regResult && regResult.length >= 2) {
          workItemId = parseInt(regResult[1]);
          console.log(`... success! Work item id = ${workItemId}`);
        } else {
          console.log("... failed!");
        }
      }
    } else {
      console.log("Trigger from merge/direct push.");
      const commitMessage = github.context.payload.head_commit.message;
      console.log("Try matching work item id from commit message ...");
      let regResult = commitMessage.match(rExp);
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
      .getWorkItem(workItemId, undefined, undefined, WorkItemExpand.Relations)
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
    if (addPullRequestLink && triggerFromPr) {
      console.log("Adding PR link to card ...");

      try {
        const dataProviderResponse = await fetch(dataProviderUrl, {
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
            contributionIds: [msGitHubLinkDataProviderLink],
          }),
        });
        if (dataProviderResponse.status === 401) {
          throw new Error(
            "Missing authorization (Linking PRs to cards requires full access for the PAT)."
          );
        }
        const responseData = await dataProviderResponse.json();
        const internalRepoId: string | null =
          responseData.data[msGitHubLinkDataProviderLink].resolvedLinkItems[0]
            .repoInternalId ?? null;
        if (null === internalRepoId || internalRepoId.length === 0) {
          throw new Error("Internal repo url couldn't be resolved.");
        }

        const artifactUrl = `vstfs:///GitHub/PullRequest/${internalRepoId}%2F${prRequestId}`;

        try {
          workItem = await azWorkApi.updateWorkItem(
            {},
            [
              {
                op: "add",
                path: "/relations/-",
                value: {
                  rel: relArticaftLink,
                  url: artifactUrl,

                  attributes: {
                    name: relNameGitHubPr,
                    comment: `Pull Request ${prRequestId}`,
                  },
                },
              },
            ],
            workItemId,
            undefined,
            undefined,
            undefined,
            undefined,
            WorkItemExpand.Relations
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
      let skipStateAssignment = false;
      hasError = false;
      if (dontSetStateWhilePrsOpen) {
        try {
          const linkedPrs = workItem.relations?.filter(
            (rel) =>
              rel.rel === relArticaftLink &&
              rel.attributes?.name === relNameGitHubPr
          );
          if (undefined !== linkedPrs && linkedPrs.length > 0) {
            // Match ArticaftLinks into internalRepoIds and PR numbers to request states
            let prIdentifierList: {
              itemType: number;
              numberOrSHA: string;
              repoInternalId: string;
            }[] = [];

            const prLinkRegex: RegExp = new RegExp(artifactLinkGitHubPrRegex);
            console.log(linkedPrs);
            for (const pr of linkedPrs) {
              let prLinkRegResult = pr.url?.match(prLinkRegex);
              console.log(prLinkRegResult);
              if (undefined !== prLinkRegResult && null !== prLinkRegResult) {
                prIdentifierList.push({
                  itemType: 1,
                  numberOrSHA: prLinkRegResult[2],
                  repoInternalId: prLinkRegResult[1],
                });
              }
            }

            console.log({
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
                    identifiers: prIdentifierList,
                  },
                },
                contributionIds: [msGitHubLinkDataProviderLink],
              }),
            });
            // Request states for all PRs
            const dataProviderResponse = await fetch(dataProviderUrl, {
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
                    identifiers: prIdentifierList,
                  },
                },
                contributionIds: [msGitHubLinkDataProviderLink],
              }),
            });
            if (dataProviderResponse.status === 401) {
              throw new Error(
                "Missing authorization (Linking PRs to cards requires full access for the PAT)."
              );
            }

            const responseData = await dataProviderResponse.json();
            console.log(responseData);
            const resolvedLinkItems =
              responseData.data[msGitHubLinkDataProviderLink].resolvedLinkItems;
            if (!Array.isArray(resolvedLinkItems)) {
              throw new Error("Error fetching linked PR data.");
            }
            for (const resolvedLinkItem of resolvedLinkItems) {
              if (undefined === resolvedLinkItem.state) {
                throw new Error("Error fetching PR state from linked PR data.");
              }
              if (resolvedLinkItem.state === "Open") {
                skipStateAssignment = true;
                break;
              }
            }
          }
        } catch (exception) {
          hasError = true;
          console.log(`... failed! ${exception}`);
          if (failOnError) {
            core.setFailed(`Failed to fetch states of linked PRs!`);
            return;
          }
        }
      }
      if (!hasError) {
        if (!skipStateAssignment) {
          hasError = false;
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
        } else {
          console.log("... skipped, still has open PRs!");
        }
      }
    }
  } catch (error) {
    console.error(error);
    core.setFailed("Unknown error" + error);
    throw error;
  }
}

run();
