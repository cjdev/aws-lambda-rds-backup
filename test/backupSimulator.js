const moment = require("moment").utc
const log = require("loglevel")
const backup = require("../app/index.js")

let snapshotsByDB = { "a": [] }

let _id = 0
const genId = () => _id++

let time = moment().year(2000).startOf("year")

const advanceDay = () => time.add(1, "day")

const captureSnapshot = () => snapshotsByDB = Object.assign({}, ...Object.keys(snapshotsByDB)
  .map(databaseId => (
    { [databaseId]: snapshotsByDB[databaseId].concat(
      { DBSnapshotIdentifier: `${genId()}-${time.clone().format("YYYY-MM-DD-HH-mm")}`,
        backupTime: time.clone()
      }
    )}
  )))


const simulateDay = () => {
  log.debug("===========================SIMULATING DAY==================================")
  log.debug("simulator--date is ", time)

  captureSnapshot()
  log.debug("simulator--snapshot snapshotsByDB: \n", JSON.stringify(snapshotsByDB))

  const backupsToDeleteByDB = backup.backupsToDeleteByDB(time, snapshotsByDB)
  log.debug(`simulator--backupsToDeleteByDB: ${JSON.stringify(backupsToDeleteByDB)}`)

  snapshotsByDB = Object.assign({}, ...Object.keys(snapshotsByDB).map(databaseId => {
    const candidateSnapshots = snapshotsByDB[databaseId]
    const backupsToDelete = backupsToDeleteByDB[databaseId]
    const filteredSnapshots = candidateSnapshots
      .filter(({ DBSnapshotIdentifier: candidateSnapshotId }) =>
        !backupsToDelete
          .map(({ DBSnapshotIdentifier }) => DBSnapshotIdentifier)
          .includes(candidateSnapshotId)
      )
    return { [databaseId]: filteredSnapshots }
  }))
  log.debug(`simulator--snapshotsByDB after filtering: \n${JSON.stringify(snapshotsByDB)}`)

  advanceDay()
}

const runBackupSimulation = ((numDays) => {
  for (let i=0; i < numDays; i++) {
    simulateDay()
  }
  return snapshotsByDB
})

exports.runBackupSimulation = runBackupSimulation
