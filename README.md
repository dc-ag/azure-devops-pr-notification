# Azure DevOps Pull Request Notifications

Automatically links a GitHub PR to Azure DevOps Work Item and/or set a custom state for it.\
Please read the annotations for the yaml file below!

## Example Usage

```yaml
name: "Update DevOps Work Item"
on:
  pull_request:
    types: [opened, ready_for_review]

jobs:
  update-devops-workitem:
    runs-on: ubuntu-latest
    steps:
      - name: "Update DevOps Work Item"
        uses: dc-ag/azure-devops-pr-notification@v1.0.0
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          devops-card-id-regex: "[a-zA-Z0-9]*/([0-9]+)_.*" # Regex which gets applied to title, body and branch name
                                                           # (in this order) to find the DevOpsId (only first match
                                                           # gets used)
          set-to-state: "" # The state you want the work item to be set to (exact string match). Keep empty to skip.
          add-pr-link: true # Wheather you want to add the PR to DevOps (requires GitHub Integration into DevOps and 
                            # the repo to be actively linked!)
          devops-organization: "org" # The url-slug of the devops organization
          devops-pat: "###" # The Personal-Access-Token (PAT) to authorize the action to communicate with DevOps.
                            # As of now the PAT needs the following rights:
                            # - "Work Items - Read, write, & manage" to move the work item between states
                            # - "Full Access" to link the PR to the work item (currently there is no specific right to
                            #     only allow this, it only works with full access. Be careful who you give this token!)
          fail-on-error: true # If you don't want the action to fail (and create failed checks) on error (e.g. when 
                              # the work item id couldn't be found via the regex or an unforseen error occurs) set
                              # this to false. Setting this to false will also allow partial completion (e.g. only 
                              # link pr but not move the state)
          
```

## Build
```shell
npm run build && npm run package
```