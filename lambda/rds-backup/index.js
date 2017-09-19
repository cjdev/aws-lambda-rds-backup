const AWS = require('aws-sdk');
const rds = new AWS.RDS();

//=============HELPERS==============
const describeDBInstances = () => {
  console.log('Getting all DB instances...');
  return rds
    .describeDBInstances({})
    .promise()
    .then(data => {
      if (data.DBInstances) {
        console.log('Instances found: ' + data.DBInstances.map(i => i.DBInstanceIdentifier));
        return data.DBInstances
      } else {
        console.log('No DB instances available; exiting.');
        return;
      }
    })
}

const checkBackupTags = dbInstances => {
  return dbInstances.map(dbInstance => {

    const dbId = dbInstance.DBInstanceIdentifier;
    console.log('Getting tags for id: ' + dbId);

    return rds
      .listTagsForResource({ ResourceName: dbInstance.DBInstanceArn })
      .promise()
      .then(data => {
        // if tags contain backup tag, continue
        if (!data.TagList) {
          console.log('No tags found; skipping id: ' + dbId);
          return;
        }
        const backupTag = data.TagList.filter (({Key: k, Value: v}) => k === 'cj:backup' && v === 'true');
        if (backupTag.length === 0) {
          console.log('This instance is not tagged with "cj:backup": "true"; skipping id: ' + dbId);
          return;
        } else {
          console.log('Instance tagged with "cj:backup": "true" found; proceeding with id: ' + dbId);
          return rds
            .describeDBSnapshots({ DBInstanceIdentifier: dbId })
            .promise()
            .then(data => copyDBSnapshots(data.DBSnapshots))
            .catch(console.log)
        }
      });
  })
}

const copyDBSnapshots = allSnapshots => {
  const autoSnapshots = allSnapshots.filter(s => s.SnapshotType === 'automated');
  const manualSnapshots = allSnapshots.filter(s => s.SnapshotType === 'manual');
  const manualSnapshotIds = manualSnapshots.map(s => s.DBSnapshotIdentifier);

  return autoSnapshots.map(snapshot => {
    const id = snapshot.DBSnapshotIdentifier;
    const backupId = snapshot.DBSnapshotIdentifier.split('rds:').slice(1).join('-') + '-backup';

    if (manualSnapshotIds.includes(backupId)) {
      console.log('Snapshot ' + backupId + ' already exists; skipping.');
      return;
    } else {
      console.log('Copying automated snapshot id ' + id + ` to manual snapshot id ` + backupId);
    }

    const params = {
      SourceDBSnapshotIdentifier: id,
      TargetDBSnapshotIdentifier: backupId
    };
    return rds
      .copyDBSnapshot(params)
      .promise()
      .then(data => {
        const dBSnapshotIdentifier = data.DBSnapshot.DBSnapshotIdentifier;
        console.log('Successfully copied snapshot with id: ', dBSnapshotIdentifier);
        return dBSnapshotIdentifier;
      })
      .catch(console.log)
  });
};


// =============LOGIC===============
console.log('Loading function...');

exports.handler = (event, context) => {
  AWS.config.update({region: event.region});
  describeDBInstances()
  .then(checkBackupTags)
  .then(copyDBSnapshots)
  .catch(console.log)
}
