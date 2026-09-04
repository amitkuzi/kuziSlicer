// Connectivity-only check: FTPS login + MQTT connect to the real A1 Mini, no upload/print.
import * as ftp from 'basic-ftp'
import mqtt from 'mqtt'

const IP = process.argv[2]
const ACCESS_CODE = process.argv[3]
const SERIAL = process.argv[4]

console.log('--- FTPS connectivity test ---')
try {
  const client = new ftp.Client(10000)
  await client.access({
    host: IP,
    port: 990,
    user: 'bblp',
    password: ACCESS_CODE,
    secure: 'implicit',
    secureOptions: { rejectUnauthorized: false },
  })
  const list = await client.list()
  console.log('FTPS OK. Root listing:', list.map((f) => f.name))
  client.close()
} catch (err) {
  console.error('FTPS FAILED:', err.message)
}

console.log('--- MQTT connectivity test ---')
await new Promise((resolve) => {
  const client = mqtt.connect(`mqtts://${IP}:8883`, {
    username: 'bblp',
    password: ACCESS_CODE,
    rejectUnauthorized: false,
    reconnectPeriod: 0,
    connectTimeout: 10000,
  })
  const timer = setTimeout(() => {
    console.error('MQTT FAILED: timeout')
    client.end(true)
    resolve()
  }, 12000)
  client.on('connect', () => {
    clearTimeout(timer)
    console.log('MQTT OK: connected')
    // Subscribe to the report topic briefly to see if the printer responds with status
    client.subscribe(`device/${SERIAL}/report`, (err) => {
      if (err) console.error('Subscribe error:', err.message)
      else console.log('Subscribed to report topic')
    })
    setTimeout(() => {
      client.end(true)
      resolve()
    }, 3000)
  })
  client.on('message', (topic, payload) => {
    console.log('MQTT message on', topic, ':', payload.toString().slice(0, 300))
  })
  client.on('error', (err) => {
    clearTimeout(timer)
    console.error('MQTT FAILED:', err.message)
    client.end(true)
    resolve()
  })
})

process.exit(0)
