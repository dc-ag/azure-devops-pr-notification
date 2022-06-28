"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const azdev = __importStar(require("azure-devops-node-api"));
const WorkItemTrackingInterfaces_1 = require("azure-devops-node-api/interfaces/WorkItemTrackingInterfaces");
const node_fetch_1 = __importDefault(require("node-fetch"));
const relArticaftLink = "ArtifactLink";
const relNameGitHubPr = "GitHub Pull Request";
const msGitHubLinkDataProviderLink = "ms.vss-work-web.github-link-data-provider";
const dataProviderUrlBase = `https://dev.azure.com/%DEVOPS_ORG%/_apis/Contribution/dataProviders/query?api-version=7.1-preview.1`;
const artifactLinkGitHubPrRegex = "\\/GitHub\\/PullRequest\\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})%2F([0-9]*)";
// eslint-disable-next-line require-jsdoc
function run() {
    var _a, _b, _c, _d;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const repoToken = core.getInput("repo-token", { required: true });
            const devOpsOrg = core.getInput("devops-organization", {
                required: true,
                trimWhitespace: true,
            });
            const azToken = core.getInput("devops-pat", {
                required: true,
                trimWhitespace: true,
            });
            const failOnError = core.getBooleanInput("fail-on-error");
            const devOpsIdRegex = core.getInput("devops-work-item-regex", {
                required: true,
                trimWhitespace: true,
            });
            const setToState = core.getInput("set-to-state", {
                trimWhitespace: true,
            });
            const dontSetStateWhilePrsOpen = core.getBooleanInput("dont-set-state-while-prs-open");
            const addPullRequestLink = core.getBooleanInput("add-pr-link");
            const dataProviderUrl = dataProviderUrlBase.replace("%DEVOPS_ORG%", devOpsOrg);
            const rExp = new RegExp(devOpsIdRegex);
            let workItemId = null;
            const prRequestId = github.context.issue.number;
            const prRepo = github.context.repo.repo;
            const prOrg = github.context.repo.owner;
            const triggerFromPr = undefined !== prRequestId;
            if (triggerFromPr) {
                console.log("Trigger from PR.");
                const repoClient = github.getOctokit(repoToken);
                const prResponse = yield repoClient.rest.pulls.get({
                    owner: prOrg,
                    repo: prRepo,
                    pull_number: prRequestId,
                });
                const branchName = prResponse.data.head.ref;
                const title = prResponse.data.title;
                const description = (_a = prResponse.data.body) !== null && _a !== void 0 ? _a : "";
                // Match from title
                console.log("Try matching work item id from title ...");
                let regResult = title.match(rExp);
                if (null !== regResult && regResult.length >= 2) {
                    workItemId = parseInt(regResult[1]);
                    console.log(`... success! Work item id = ${workItemId}`);
                }
                else {
                    console.log("... failed!");
                }
                // Match from description if not found in title
                if (null === workItemId) {
                    console.log("Try matching work item id from description ...");
                    regResult = description.match(rExp);
                    if (null !== regResult && regResult.length >= 2) {
                        workItemId = parseInt(regResult[1]);
                        console.log(`... success! Work item id = ${workItemId}`);
                    }
                    else {
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
                    }
                    else {
                        console.log("... failed!");
                    }
                }
            }
            else {
                console.log("Trigger from merge/direct push.");
                const commitMessage = github.context.payload.head_commit.message;
                console.log("Try matching work item id from commit message ...");
                let regResult = commitMessage.match(rExp);
                if (null !== regResult && regResult.length >= 2) {
                    workItemId = parseInt(regResult[1]);
                    console.log(`... success! Work item id = ${workItemId}`);
                }
                else {
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
            let azWorkApi;
            try {
                let orgUrl = `https://dev.azure.com/${devOpsOrg}`;
                let authHandler = azdev.getPersonalAccessTokenHandler(azToken);
                let azWebApi = new azdev.WebApi(orgUrl, authHandler);
                azWorkApi = yield azWebApi.getWorkItemTrackingApi();
            }
            catch (exception) {
                console.log(`... failed! ${exception}`);
                if (failOnError) {
                    core.setFailed("Failed connection to dev ops!");
                }
                return;
            }
            console.log("... success!");
            console.log("Check if work item exists ...");
            let workItem = null;
            let hasError = false;
            yield azWorkApi
                .getWorkItem(workItemId, undefined, undefined, WorkItemTrackingInterfaces_1.WorkItemExpand.Relations)
                .then((wi) => {
                workItem = wi;
            })
                .catch((error) => {
                if (error.statusCode === 401) {
                    hasError = true;
                    console.log("Missing authorization (PAT needs to have 'Work Items - Read, write, & manage').");
                    if (failOnError) {
                        core.setFailed("Missing authorization (PAT needs to have 'Work Items - Read, write, & manage').");
                    }
                }
                else {
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
                    const dataProviderResponse = yield (0, node_fetch_1.default)(dataProviderUrl, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Basic ${Buffer.from(":" + azToken).toString("base64")}`,
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
                        throw new Error("Missing authorization (Linking PRs to cards requires full access for the PAT).");
                    }
                    const responseData = yield dataProviderResponse.json();
                    const internalRepoId = (_b = responseData.data[msGitHubLinkDataProviderLink].resolvedLinkItems[0]
                        .repoInternalId) !== null && _b !== void 0 ? _b : null;
                    if (null === internalRepoId || internalRepoId.length === 0) {
                        throw new Error("Internal repo url couldn't be resolved.");
                    }
                    const artifactUrl = `vstfs:///GitHub/PullRequest/${internalRepoId}%2F${prRequestId}`;
                    try {
                        workItem = yield azWorkApi.updateWorkItem({}, [
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
                        ], workItemId, undefined, undefined, undefined, undefined, WorkItemTrackingInterfaces_1.WorkItemExpand.Relations);
                    }
                    catch (exception) {
                        const errorMessage = exception.toString();
                        if (-1 !== errorMessage.indexOf("already exists")) {
                            console.log("... (already exists) ...");
                        }
                        else {
                            throw exception;
                        }
                    }
                }
                catch (exception) {
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
                        const linkedPrs = (_c = workItem.relations) === null || _c === void 0 ? void 0 : _c.filter((rel) => {
                            var _a;
                            return rel.rel === relArticaftLink &&
                                ((_a = rel.attributes) === null || _a === void 0 ? void 0 : _a.name) === relNameGitHubPr;
                        });
                        if (undefined !== linkedPrs && linkedPrs.length > 0) {
                            // Match ArticaftLinks into internalRepoIds and PR numbers to request states
                            let prIdentifierList = [];
                            const prLinkRegex = new RegExp(artifactLinkGitHubPrRegex);
                            console.log(artifactLinkGitHubPrRegex);
                            for (const pr of linkedPrs) {
                                console.log(pr);
                                let prLinkRegResult = (_d = pr.url) === null || _d === void 0 ? void 0 : _d.match(prLinkRegex);
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
                                    Authorization: `Basic ${Buffer.from(":" + azToken).toString("base64")}`,
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
                            const dataProviderResponse = yield (0, node_fetch_1.default)(dataProviderUrl, {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Basic ${Buffer.from(":" + azToken).toString("base64")}`,
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
                                throw new Error("Missing authorization (Linking PRs to cards requires full access for the PAT).");
                            }
                            const responseData = yield dataProviderResponse.json();
                            console.log(responseData);
                            const resolvedLinkItems = responseData.data[msGitHubLinkDataProviderLink].resolvedLinkItems;
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
                    }
                    catch (exception) {
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
                            yield azWorkApi.updateWorkItem({}, [
                                {
                                    op: "replace",
                                    path: "/fields/System.State",
                                    value: setToState,
                                },
                            ], workItemId);
                        }
                        catch (exception) {
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
                    else {
                        console.log("... skipped, still has open PRs!");
                    }
                }
            }
        }
        catch (error) {
            console.error(error);
            core.setFailed("Unknown error" + error);
            throw error;
        }
    });
}
exports.run = run;
run();
