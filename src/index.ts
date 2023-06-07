import Debug from 'debug'
import morgan from 'morgan'
import routes from '@/src/routes'
import restify from 'restify'
import config from '@/config'
import mongoose from 'mongoose'
import errs, { BadRequestError } from 'restify-errors'


const debug = Debug('api:index')

// declare module 'restify' {
//   interface Request {
//     payload?: any;
//   }
// }

const server = restify.createServer({
  name: config.name,
  version: config.version,
})


server.server.setTimeout(60000 * 5)
if (__DEV__ === true) {
  server.use(morgan('dev'))
}

server.use(restify.plugins.queryParser())
server.use(restify.plugins.bodyParser({ mapParams: false }))

let counter = 0
const ATTEMPTS = 20
debug('conectando a la base de datos:\n%s', config.databaseURI)
mongoose.connect(config.databaseURI)
mongoose.connection.on('error', (err) => {
  debug('error conectando a la base de datos')
  if (err.code === 'ECONNREFUSED' && counter !== ATTEMPTS) {
    console.log(`intentando conectar a mongodb [${++counter}/${ATTEMPTS}]...`)
    setTimeout(() => {
      mongoose.connect(config.databaseURI)
    }, 5000)
  } else {
    console.error(err)
    process.exit(1)
  }
})

mongoose.connection.once('open', () => {
  debug('se conectó a la base de datos')
  routes.applyRoutes(server)
  server.listen(config.port, () => {
    console.log(`Server is listening on port ${config.port}`)
  })
})

process.on('uncaughtException', function(err) {
  console.error({
    code: err.name,
    message: err.message,
    ...(errs as any).info(err),
  })
})

server.on('restifyError', (req, res, err, callback) => {
  console.error('se ha capturado un error: ')
  try {
    err.toJSON = function () {
      return {
        code: err.name,
        message: err.message,
        ...(errs as any).info(err),
      }
    }
  } catch (e){
    res.send(new BadRequestError(
      {
        info: { typeCode: 'NotCode' },
      },
      'Error no controlado',
    ))
  }
  let errorMessage: any
  switch (err.name) {
    case 'ValidationError':
      errorMessage = err.toString()
      break
    default:
      errorMessage = err
  }
  console.error(
    '*** Fecha:', new Date().toLocaleString(),
    '\nEndpoint:', req.method, req.href(),
    '\nError:', errorMessage,
    '\nInformación adicional:', (<any>errs).info(err),
    '\n------------------------------------',
  )
  return callback()
})

const signals = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGTERM: 15,
}

const shutdown = (signal, value: number) => {
  console.log('shutdown!')
  server.close(() => {
    mongoose.connection.close(() => {
      console.log(`server stopped by ${signal} with value ${value}`)
      process.exit(128 + value)
    })
  })
}

Object.keys(signals).forEach((signal) => {
  process.on(<any>signal, () => {
    console.log(`process received a ${signal} signal`)
    shutdown(signal, signals[signal])
  })
})
