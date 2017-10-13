const assert = require("assert")

const moment = require("moment").utc
const log = require("loglevel")

const backup = require("../app/index")
const sim = require("./backupSimulator.js")

log.setLevel("silent")
describe("backup", () => {

  describe("difference", () => {
    it("should get difference of two lists", () => {
      const arr1 = [1,2,3,4,5]
      const arr2 = [1,4,3]
      const expected = [2,5]
      const actual = backup.difference(arr1, arr2)
      assert.deepEqual(actual, expected)
    })
  })

  describe("backupsToDeleteSimple", () => {
    describe("simulation", () => {
      const benchmarkStart = moment()
      const daysToRunSim = 366 + 181 // 1.5 years
      const simStart = moment().year(2000).startOf("year")
      const simEnd = simStart.clone().add(daysToRunSim, "days")

      let snapshots = sim.runBackupSimulation(daysToRunSim)
      log.debug(`\n== Simulation Results ==\n  last day with snapshot: ${simEnd.subtract(1,"day").calendar()}\n  ${JSON.stringify(snapshots)} \n`)
      log.info("simulation took " + moment().diff(benchmarkStart, "ms") + " milliseconds")

      const shouldInclude = (d) => {
        Object.keys(snapshots).map(databaseId => {
          const createTimeIndex = snapshots[databaseId].findIndex((({SnapshotCreateTime}) =>
            moment(SnapshotCreateTime).isSame(d, "day")))
          assert(createTimeIndex !== -1, `expected snapshots to include ${d}, but they did not`)
        })
      }

      const shouldNotInclude = (d) => {
        Object.keys(snapshots).map(databaseId => {
          const createTimeIndex = snapshots[databaseId].findIndex((({SnapshotCreateTime}) =>
            moment(SnapshotCreateTime).isSame(d, "day")))
          assert(createTimeIndex === -1, `expected snapshots to not include ${d}, but they did`)
        })
      }

      const dayAt = (y, m, d) => moment().year(y).startOf("year").month(m - 1).date(d)

      const dayRange = (startDay, numDays) => {
        let days = []
        var time = startDay.clone().startOf("day")
        for (let i = 0; i < numDays; i++) {
          days.push(time.clone())
          time.add(1, "day")
        }
        return days
      }

      it("should retain the last 35 days of snapshots", () => {
        dayRange(dayAt(2001, 5, 27), 35).forEach(shouldInclude)
      })

      it("should include weekly snapshots for the last 24 weeks", () => {
        const time = dayAt(2001, 5, 20)
        for (let i = 0; i < 24; i++) {
          shouldInclude(time)
          dayRange(time.clone().add(1, "day"), 6).forEach(shouldNotInclude)
          time.subtract(1, "week")
        }
      })

      it("should include monthly snapshots unto eternity", () => {
        dayRange(dayAt(2000, 12, 1), 2).forEach(shouldNotInclude)
        shouldInclude(dayAt(2000, 12, 3))
        dayRange(dayAt(2000, 12, 4), 6).forEach(shouldNotInclude)

        const time = dayAt(2000, 11, 1)
        for (let i = 0; i < 10; i++) {
          const firstSunday = time.day() === 0 ? time : time.clone().day(7)
          dayRange(time, firstSunday.date() - 1).forEach(shouldNotInclude)
          shouldInclude(firstSunday)
          dayRange(firstSunday.clone().add(1, "day"), time.daysInMonth() - firstSunday.date()).forEach(shouldNotInclude)
          time.subtract(1, "month")
        }
      })

      it("should include the oldest snapshot", () => {
        shouldInclude(dayAt(2000, 1, 1))
        dayRange(dayAt(2000, 1, 2), 30).forEach(shouldNotInclude)
      })
    })
  })
})
