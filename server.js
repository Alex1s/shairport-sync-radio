`use strict`

const express = require('express')
const process = require(`process`)

const app = express()

const fileSize = 0xFFFF_FFFC
const headerHexString = `52494646f4ffffff57415645666d7420100000000100020044ac000010b102000400100064617461d0ffffff`
const headerBuffer = new Uint8Array(headerHexString.match(/../g).map(h=>parseInt(h,16)))
const totalBytesToSend = process.env.TOTAL_BYTES_TO_SEND || 4096

app.get('/radio.wav', (req, res) => {
    console.debug(req.method)
    console.debug(req.headers)

    res.contentType(`audio/wav`)

    res.on(`close`, () => {
        console.debug(`WAV stream closed!`)
    })
    res.on(`error`, err => {
        console.error(`WAV stream error:`)
        console.error(err)
    })


    const ranges = req.range(fileSize)
    if (!ranges) {
        console.debug(`res.writableHighWaterMark: ${res.writableHighWaterMark}`)
        console.debug(`No range specified. Just sending wav header followed with some trash bytes to send in total ${totalBytesToSend}. Connection is not closed as this should be done by the AMP.`)

        // we send in total (with the header) 4096 bytes
        // if we send less the AMP does not close the connection and sends a new request with a bytes=44-0 header
        // not sure if 4096 this is related to Express, node.js, the (linux) kerel, the NIC or the AMP
        // so try around with this value if the AMP does not follow
        res.write(headerBuffer)
        res.write(`0`.repeat(totalBytesToSend - headerBuffer.byteLength))         //res.end()
    } else if (ranges) { // this should be the AMP
        console.assert(ranges)
        console.assert(ranges[0])
        console.assert(ranges[0].start === 44)
        console.assert(ranges[0].end === fileSize - 1)

        res.setHeader(`Content-Range`, `bytes 44-${fileSize - 1}/${fileSize}`)
        process.stdin.pipe(res)
        console.debug(`WAV stream pipe!`)
    }
})

const listener = app.listen(process.env.PORT, () => {
    console.debug(`The webserver is running and listening on port ${listener.address().port}`)
})