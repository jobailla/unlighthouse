import { RouteDefinition } from 'nuxt-kit-extras/types'
import {
    init as initCluster,
    inspectHtmlTask,
    runLighthouseWorker,
} from '../puppeteer'
import { Options, RouteReport } from '../../types'
import { normaliseRouteJobInput, useLogger } from '../../core'
import { $URL } from 'ufo'


export async function createRouteWorkerCluster(options: Options) {
  const logger = useLogger()
  const cluster = await initCluster(options)

  const jobMap = new Map()

  const jobs = {
    inspectHtmlTask,
    runLighthouseWorker,
  }

  const queueRoute = (route: RouteDefinition) => {
    let url: $URL
    if (typeof route === 'string') {
       url = new $URL(route)
    }
    const path = url.pathname

    // don't run on named routes
    // @todo check for route params
    if (jobMap.has(path)) {
      logger.debug(`${path} has already been processed, skipping`)
      return
    }

    const routeReport = normaliseRouteJobInput(url, options)
    logger.debug(`${path} has been queued.`)

    jobMap.set(path, routeReport)

    const taskOptions = {
      routeReport,
      options,
    }


    Object.values(jobs)
      .forEach((job, key) => cluster.execute(taskOptions, job)
        .then((response) => {
          if (!response)
            return
          const jobName = Object.keys(jobs)[key]
          logger.info(`${path} has finished processing job ${jobName}.`)
          jobMap.set(path, response)
        }),
      )
  }

  const queueRoutes = (routes: RouteDefinition[]) => {
    routes.forEach(route => queueRoute(route))
  }

  const runningTasks = () => {
    return Array.from(jobMap.values()).filter(report => !report.resolved).length
  }

  const hasStarted = () => {
    return jobMap.size > 0
  }

  const reports = () => {
    const r: RouteReport[] = []
    jobMap.forEach((val) => {
      r.push(val)
    })
    return r
  }

  return {
    cluster,
    processRoute: queueRoute,
    processRoutes: queueRoutes,
    runningTasks,
    hasStarted,
    reports,
  }
}