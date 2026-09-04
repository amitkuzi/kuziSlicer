import mqtt from 'mqtt'

const IP = '192.168.1.14'
const ACCESS_CODE = '11388578'
const SERIAL = '0300Da5d2800535'

const client = mqtt.connect(`mqtts://${IP}:8883`, {
  username: 'bblp',
  password: ACCESS_CODE,
  rejectUnauthorized: false,
  reconnectPeriod: 0,
  connectTimeout: 15000,
})

let gotReport = false

client.on('connect', () => {
  console.log('Connected. Subscribing to report topic...')
  client.subscribe(`device/${SERIAL}/report`, { qos: 0 }, (err) => {
    if (err) console.error('Subscribe error:', err.message)
    else console.log('Subscribed. Requesting full status (pushall)...')
    client.publish(`device/${SERIAL}/request`, JSON.stringify({
      pushing: { sequence_id: '0', command: 'pushall' }
    }), { qos: 0 })
  })
})

client.on('message', (topic, payload) => {
  gotReport = true
  try {
    const data = JSON.parse(payload.toString())
    console.log('--- MQTT report ---')
    console.log(JSON.stringify(data, null, 2).slice(0, 3000))
  } catch (e) {
    console.log('Raw payload:', payload.toString().slice(0, 500))
  }
})

client.on('error', (err) => console.error('MQTT error:', err.message))

setTimeout(() => {
  if (!gotReport) console.log('No report received within timeout')
  client.end(true)
  process.exit(0)
}, 12000)
