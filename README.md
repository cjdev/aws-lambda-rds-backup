# AWS Lambda RDS Backup

## Motivation

AWS Relational Database Service (RDS) can be configured to take automated snapshots on a regular basis. These snapshots, while useful, have several downsides:

* If an RDS instance is deleted by a user, its automated backups are deleted as well.
* Automated snapshots are only stored for a maximum of 35 days.

Manual snapshots, on the other hand, stick around forever--regardless of the state of their parent instance. This repo contains an AWS Lambda which, when triggered, converts the automated snapshots of all RDS instances tagged with "cj:backup":"true" into manual snapshots.

## Instructions

### Provisioning

This tool uses a CloudFormation template to provision a placeholder Lambda function and an associated IAM Role with the required permissions. We use [CloudSeeder](https://github.com/cjdev/cloud-seeder) to execute that CloudFormation template, like so:

```bash
cd /Provisioning
./config.hs deploy lambda production
```

### Deployment

In order to deploy code changes to AWS Lambda, we use [aws-lambda-gulp-boilerplate](https://github.com/tombray/aws-lambda-gulp-boilerplate), like so:

```bash
gulp -l rds-backup
```

Further documentation can be found with `gulp -T` and `gulp --help`.
