export const DEVELOPMENT_ENV =
  process.env.NOTIFICACIONESENV !== 'production' || !!__DEV__

function getDatabaseURI () {
  if (process.env.MONGO_URI) {
    return process.env.MONGO_URI
  }
  const mongo = {
    user: process.env.MONGO_USERNAME,
    pass: process.env.MONGO_PASSWORD,
    host: process.env.MONGO_HOST,
    port: process.env.MONGO_PORT,
    db: 'mxcfdi'
  }
  return process.env.USE_LOCAL_DB
    ? `mongodb://localhost:27017/mxcfdi`
    : `mongodb://${mongo.user}:${mongo.pass}@${mongo.host}:${mongo.port}\
/${mongo.db}?authSource=tocusers`
}
  
export default {
  name: 'api-notificaciones',
  version: '0.0.1',
  port: process.env.PORT || '5000',
  databaseURI: getDatabaseURI(),
  databaseAttempts: 20,
}
