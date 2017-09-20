const moment = require("moment").utc
const AWS = require("aws-sdk")
const RDS = new AWS.RDS()
const log = require("loglevel")

//============TYPES==============
// DBInstance = { DBInstanceIdentifier: String, DBInstanceArn: String, ... }
// Snapshot = { DBSnapshotIdentifier: String, SnapshotCreateTime: String, ... }
// SnapshotsByDB = Dict [Snapshot]

//=============GENERAL=============
// describeDBInstances :: () -> Promise [DBInstance]
const describeDBInstances = () => {
  return RDS
    .describeDBInstances({})
    .promise()
    .then(({ DBInstances }) => {
      log.debug("(describeDBInstances) instances found: \n", DBInstances)
      return DBInstances
    })
}

//=============COPY SNAPS=============
// databasesWithBackupTags :: [DBInstance] -> Promise [DBInstance]
// filter databases not tagged with "cj:backup":"true"
const databasesWithBackupTags = dbInstances => {
  log.debug("(databasesWithBackupTags) dbInstances:\n", JSON.stringify(dbInstances))
  return Promise.all(
    dbInstances.map(dbInstance => {
      const { DBInstanceIdentifier, DBInstanceArn } = dbInstance
      log.debug("(databasesWithBackupTags) getting tags for id: " + DBInstanceIdentifier)

      return RDS
        .listTagsForResource({ ResourceName: DBInstanceArn })
        .promise()
        .then(({ TagList }) => {
          const backupTagIdx = TagList.findIndex(({Key, Value}) =>
            Key === "cj:backup" && Value === "true")
          return backupTagIdx === -1 ? null : dbInstance
        })
    })
  ).then(dbInstances => dbInstances.filter(dbInstance => dbInstance !== null))
}

// unbackedUpAutomatedSnapshots :: [Snapshot] -> [Snapshot]
const unbackedUpAutomatedSnapshots = allSnapshots => {
  log.debug("(unbackedUpAutomatedSnapshots) allSnapshots:\n", JSON.stringify(allSnapshots))
  const autoSnapshots = allSnapshots.filter(({ SnapshotType }) => SnapshotType === "automated")
  const manualSnapshots = allSnapshots.filter(({ SnapshotType }) => SnapshotType === "manual")
  const manualSnapshotIds = manualSnapshots.map(({ DBSnapshotIdentifier }) => DBSnapshotIdentifier)

  const autoSnapshotsWithBackupIds = autoSnapshots.map(({ DBSnapshotIdentifier }) => {
    const backupId = DBSnapshotIdentifier.split("rds:").slice(1).join("-") + "-backup"
    return { DBSnapshotIdentifier: DBSnapshotIdentifier, backupId: backupId }
  })
  log.debug("(unbackedUpAutomatedSnapshots) autoSnapshotsWithBackupIds: ", JSON.stringify(autoSnapshotsWithBackupIds))

  return autoSnapshotsWithBackupIds.filter(({ backupId }) =>
    !manualSnapshotIds.includes(backupId)
  )
}

// getSnapshotsToBackup :: [DBInstances] -> Promise [Snapshot]
const getSnapshotsToBackup = dbInstances => {
  log.debug("(getSnapshotsToBackup) dbInstances:\n", dbInstances)
  return Promise.all(
    dbInstances.map(({ DBInstanceIdentifier }) =>
      RDS
        .describeDBSnapshots({ DBInstanceIdentifier: DBInstanceIdentifier })
        .promise()
        .then(({ DBSnapshots }) => unbackedUpAutomatedSnapshots(DBSnapshots))
    ))
    .then(snapshotsList => snapshotsList.reduce((acc, curr) => acc.concat(curr), []))
}

// backupSnapshots :: [Snapshot] -> Promise [String]
const backupSnapshots = snapshots => {
  log.debug("(backupSnapshots) snaphots:\n", JSON.stringify(snapshots))
  return Promise.all(
    snapshots.map(({ DBSnapshotIdentifier, backupId }) => {
      const params = {
        SourceDBSnapshotIdentifier: DBSnapshotIdentifier,
        TargetDBSnapshotIdentifier: backupId
      }
      log.debug(`(backupSnapshots) backing up snapshot ${DBSnapshotIdentifier} to ${backupId}`)
      log.debug(`(backupSnapshots) calling copyDBSnapshot with: ${JSON.stringify(params)}`)
      return RDS
        .copyDBSnapshot(params)
        .promise()
        .then(({ DBSnapshot }) => DBSnapshot.DBSnapshotIdentifier)
    }))
}

//============PRUNE BACKUPS===============
// getManualBackups :: [DBInstance] -> Promise SnapshotsByDB
// get all snapshots and convert to SnaphotsByDB
const getManualBackups = dbInstances => {
  log.debug("(getManualBackups) dbInstances:\n", dbInstances)
  return Promise.all(
    dbInstances.map(({ DBInstanceIdentifier: dbId }) =>
      RDS
        .describeDBSnapshots({ DBInstanceIdentifier: dbId, SnapshotType: "manual" })
        .promise()
        .then(({ DBSnapshots }) => [dbId, DBSnapshots])
    ))
    .then((tuples) => {
      log.debug("(getManualBackups) tuples:\n", JSON.stringify(tuples))
      const snapshotsByDB = tuples.reduce((acc, [dbId, snapshots]) =>
        Object.assign({}, acc, { [dbId]: snapshots }), {})
      log.debug("(getManualBackups) snapshotsByDB:\n", JSON.stringify(snapshotsByDB))
      return snapshotsByDB
    })
}

// backupsToDeleteByDB :: Moment, SnapshotsByDB -> SnapshotsByDB
const backupsToDeleteByDB = (now, snapshotsByDB) => {
  log.debug("(backupsToDeleteByDB) snapshotsByDB:\n", snapshotsByDB)
  const retainByDB = Object.assign({}, ...Object.keys(snapshotsByDB).map(databaseId => {
    return { [databaseId]: backupsToRetain(now, snapshotsByDB[databaseId]) }
  }))

  log.debug("(backupsToDeleteByDB) retainByDB: ", retainByDB)
  const mkOneBackupToDelete = (databaseId) =>
    ({ [databaseId]: difference(snapshotsByDB[databaseId], retainByDB[databaseId]) })

  return Object.assign({}, ...Object.keys(snapshotsByDB).map(mkOneBackupToDelete))
}

// difference :: [a] -> [a] -> [a]
const difference = (arr1, arr2) => arr1.filter(x => !arr2.includes(x))

// mkGenBoundary :: Moment -> Generator Moment
const mkGenBoundary = function* (start) {
  const time = start.clone().startOf("day")
  for (let i = 0; i < 35; i++) {
    yield time.clone()
    time.subtract(1, "day")
  }
  yield time.startOf("week").clone()
  for (let i = 0; i < 23; i++) {
    yield time.subtract(1, "week").clone()
  }
  yield time.startOf("month").clone()
  while (true) {
    yield time.subtract(1, "month").clone()
  }
}

// backupsToRetain :: Moment, [Snapshot] -> [Snapshot]
const backupsToRetain = (now, snapshots) => {
  log.debug("(backupsToRetain) snapshots: ", JSON.stringify(snapshots))
  const time = now.clone()

  // sort newest to oldest
  const sorted = snapshots.slice()
    .sort(({SnapshotCreateTime: a},{SnapshotCreateTime: b}) =>
      moment(b).diff(moment(a)))

  const prune = (prev, snaps, currentBoundary, genBoundary) => {
    if (snaps.length === 0) return [prev]
    const [next, ...more] = snaps
    const createTime = moment(next.SnapshotCreateTime)
    return createTime.isSameOrAfter(currentBoundary, "day")
      ? prune(next, more, currentBoundary, genBoundary)
      : prune(next, more, genBoundary.next().value, genBoundary).concat(prev)
  }

  const [first, ...rest] = sorted
  const genBoundary = mkGenBoundary(time)

  return prune(first, rest, genBoundary.next().value, genBoundary)
}

// deleteBackups :: SnapshotsByDB -> Promise [String]
const deleteBackups = snapshotsByDB => {
  log.debug("(deleteBackups) snapshotsByDB:\n", snapshotsByDB)
  return Promise.all(
    Object.keys(snapshotsByDB).map((databaseId) =>
      snapshotsByDB[databaseId].map(({ DBSnapshotIdentifier }) =>
        RDS
          .deleteDBSnapshot({ DBSnapshotIdentifier })
          .promise()
          .then(() => DBSnapshotIdentifier)
      )))
}

// =============EXPORTS===============
exports.handler = (event) => {
  AWS.config.update({region: event.region})

  log.setLevel("debug")
  log.info("Loading...")

  // now :: Moment
  const now = moment()

  let dbInstances
  // describeDBInstances :: () -> Promise [DBInstances]
  describeDBInstances()
    .catch(log.error)
    .then(data => {
      dbInstances = data

      // run backup and prune in parallel
      databasesWithBackupTags(dbInstances)
        .then(getSnapshotsToBackup)
        .then(backupSnapshots)
        .catch(log.error)

      getManualBackups(dbInstances)
        .then(snapshotsByDB =>
          Promise.resolve(backupsToDeleteByDB(now, snapshotsByDB)))
        .then(deleteBackups)
        .catch(log.error)
    })
}

// for testing
exports.difference = difference
exports.backupsToDeleteByDB = backupsToDeleteByDB
