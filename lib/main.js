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
// eslint-disable-next-line require-jsdoc
function run() {
    var _a, _b;
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
            const devOpsIdRegex = core.getInput("devops-card-id-regex", {
                required: true,
                trimWhitespace: true,
            });
            const setToState = core.getInput("set-to-state", {
                trimWhitespace: true,
            });
            const addPullRequestLink = core.getBooleanInput("add-pr-link");
            const prRequestId = github.context.issue.number;
            const prOrg = github.context.repo.owner;
            const prRepo = github.context.repo.repo;
            const repoClient = github.getOctokit(repoToken);
            const prResponse = yield repoClient.rest.pulls.get({
                owner: prOrg,
                repo: prRepo,
                pull_number: prRequestId,
            });
            const title = prResponse.data.title;
            const description = (_a = prResponse.data.body) !== null && _a !== void 0 ? _a : "";
            const rExp = new RegExp(devOpsIdRegex);
            let workItemId = null;
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
                .getWorkItem(workItemId, undefined, undefined, WorkItemTrackingInterfaces_1.WorkItemExpand.All)
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
            if (addPullRequestLink) {
                console.log("Adding PR link to card ...");
                const dataProviderUrls = `https://dev.azure.com/${devOpsOrg}/_apis/Contribution/dataProviders/query?api-version=7.1-preview.1`;
                try {
                    const dataProviderResponse = yield (0, node_fetch_1.default)(dataProviderUrls, {
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
                            contributionIds: ["ms.vss-work-web.github-link-data-provider"],
                        }),
                    });
                    if (dataProviderResponse.status === 401) {
                        throw new Error("Missing authorization (Linking PRs to cards requires full access for the PAT).");
                    }
                    const responseData = yield dataProviderResponse.json();
                    const internalRepoId = (_b = responseData.data["ms.vss-work-web.github-link-data-provider"]
                        .resolvedLinkItems[0].repoInternalId) !== null && _b !== void 0 ? _b : null;
                    if (null === internalRepoId || internalRepoId.length === 0) {
                        throw new Error("Internal repo url couldn't be resolved");
                    }
                    const artifactUrl = `vstfs:///GitHub/PullRequest/${internalRepoId}%2F${prRequestId}`;
                    try {
                        yield azWorkApi.updateWorkItem({}, [
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
                        ], workItemId);
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
