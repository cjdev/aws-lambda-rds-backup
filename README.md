# AWS Lambda RDS Backup

## Motivation

AWS Relational Database Service (RDS) can be configured to take automated snapshots on a regular basis. These snapshots, while useful, have several downsides:

* If an RDS instance is deleted by a user, its automated backups are deleted as well.
* Automated snapshots are only stored for a maximum of 35 days.

Manual snapshots, on the other hand, stick around forever--regardless of the state of their parent instance. This repo contains an AWS Lambda which, when triggered, converts the automated snapshots of all RDS instances tagged with `'cj:backup':'true'` into manual snapshots.

## Instructions

To provision pipeline infrastructure, you will need a GitHub Personal Access Token with full permissions for `repo` and `admin:repo_hook` on this repo. You must have admin permissions on this repo. Then you can run the following:

```bash
./infrastructure/provision.sh master $YOUR_GITHUB_PERSONAL_ACCESS_TOKEN
```

This will set up continuous deployment on the `master` branch. You can customize various aspects of continuous deployment by changing the parameters in `./infrastructure/pipeline.yaml`. Note that, due to limitations in the way CodePipeline handles triggering AWS CloudFormation stacks, you must use `Default` to define the `ProjectName` parameter, and _ensure that it is the same in both `./infrastructure/pipeline.yaml` and `./infrastructure/lambda.yaml`._
