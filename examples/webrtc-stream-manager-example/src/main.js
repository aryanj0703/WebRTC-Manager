// Copyright 2018-present Network Optix, Inc. Licensed under MPL 2.0: www.mozilla.org/MPL/2.0/
​
import "./style.css"
​
import { description } from "../package.json"
import { Subject, takeUntil } from "rxjs"
import { WebRTCStreamManager } from "./open_check_excluded"
​
const newStream$ = new Subject()
​
const urlParams = new URLSearchParams(window.location.search)
​
let cloudInstance = window.localStorage.getItem("cloudInstance")
//let cloudInstance = "https://vue.realwave.io"
​
const tokenEndpoint = `${cloudInstance}/oauth/token/`
//const tokenEndpoint = `${cloudInstance}/cdb/oauth2/token`
const systemsEndpoint = `${cloudInstance}/api/systems/`
const systemAuthEndopint = systemId => `${systemsEndpoint}${systemId}/auth/`
​
const authCodeGrant = {
  grant_type: "authorization_code",
  response_type: "token",
  code: urlParams.get("code")
}
​
// const authCodeGrant = {
//   grant_type: 'password',
//   response_type: 'token',
//   client_id: '3rdParty',
//   username: 'uchopra@realwave.io',
//   password: 'Realwave@2022!'
// };
​
const headersList = {
  "Content-Type": "application/json" // You can set the appropriate content type here
}
​
const getToken = (payload = authCodeGrant) =>
  fetch(tokenEndpoint, {
    method: "POST",
    body: JSON.stringify(payload),
    //headers: { 'Content-Type': 'application/json' },
    headers: headersList
  })
​
const forms = ["endpoint-data", "cloud-data"]
​
let cloudToken
let systemToken
let cameras
let systemRelay
let timeline
​
const show = (formName = "cloud-data") => {
  document.querySelector(`[name="${formName}"]`).style.display = "block"
  forms
    .filter(form => form !== formName)
    .forEach(form => {
      document.querySelector(`[name="${form}"]`).style.display = "none"
    })
}
​
const compatibleOnlineSystem = system =>
  system.stateOfHealth === "online" && parseFloat(system.version) >= 5.1
​
if (urlParams.has("code")) {
  getToken()
    .then(response => response.json())
    .then(data => {
      cloudToken = data
      show("endpoint-data")
      return data.access_token
    })
    .then(accessToken =>
      fetch(systemsEndpoint, {
        headers: { Authorization: `Bearer ${accessToken}` }
      }).then(response => response.json())
    )
    .then(systems => {
      const systemOptions = systems.map(
        system =>
          `<option value="${system.id}" ${
            compatibleOnlineSystem(system) ? "" : "disabled"
          }>${system.name}</option>`
      )
      systemSelect.innerHTML = systemOptions.join("")
      const defaultSystem = systems.find(compatibleOnlineSystem) || systems[0]
      systemSelect.value = defaultSystem.id
      const event = new Event("change")
      systemSelect.dispatchEvent(event)
    })
    .catch(() => show())
    .finally(() => {
      window.history.replaceState({}, document.title, window.location.pathname)
    })
} else {
  show()
}
​
document.querySelector("#description").innerHTML = description
​
const endpointForm = document.querySelector('[name="endpoint-data"]')
const instanceForm = document.querySelector('[name="cloud-data"]')
const systemSelect = document.querySelector('[name="selectedSystem"]')
const cameraSelect = document.querySelector('[name="selectedCamera"]')
const videoElement = document.querySelector("video")
​
const clean = id => id.replace("{", "").replace("}", "")
​
const startStream = (relayUrl, cameraId, serverId) => {
  const webRtcUrlFactory = () =>
    `wss://${relayUrl}/webrtc-tracker/?camera_id=${cameraId}&x-server-guid=${serverId}`
  // `wss://${relayUrl}/webrtc-tracker/?camera_id=${cameraId}&x-server-guid=${serverId}&pos=${time}`;
​
  console.log("relayUrl: " + relayUrl)
  console.log("accessToken: " + systemToken.access_token)
  // WebRTCStreamManager.connect(webRtcUrlFactory, videoElement)
  //   .pipe(takeUntil(newStream$))
  //   .subscribe(([stream, error]) => {
  //     if (stream) {
  //       videoElement.srcObject = stream;
  //       videoElement.muted = true;
  //       videoElement.autoplay = true;
  //     }
​
  //     if (error) {
  //       alert('Error playing back stream');
  //     }
  //   });
  // }
​
  WebRTCStreamManager.connectWithAccessToken(
    webRtcUrlFactory,
    systemToken.access_token,
    videoElement
  )
    .pipe(takeUntil(newStream$))
    .subscribe(([stream, error]) => {
      if (stream) {
        videoElement.srcObject = stream
        videoElement.muted = true
        videoElement.autoplay = true
      }
​
      if (error) {
        alert("Error playing back stream")
      }
    })
}
​
const startStreamHandler = async event => {
  event.preventDefault()
  newStream$.next()
​
  const data = new FormData(endpointForm)
  const selectedCamera = clean(data.get("selectedCamera"))
  const targetServer = clean(
    cameras.find(camera => clean(camera.id) === selectedCamera).serverId
  )
​
  startStream(systemRelay, selectedCamera, targetServer)
}
​
const redirectOauth = event => {
  event.preventDefault()
  const cloudInstance = new FormData(instanceForm).get("cloudInstance")
  window.localStorage.setItem("cloudInstance", cloudInstance)
  const authorizationUrl = `${cloudInstance}/authorize?redirect_uri=${window.location.href}`
  window.location.href = authorizationUrl
}
​
const getSystemToken = systemId => {
  const payload = {
    client_id: "cloud",
    grant_type: "refresh_token",
    response_type: "token",
    refresh_token: cloudToken.refresh_token,
    scope: `cloudSystemId=${systemId}`
  }
​
  return getToken(payload).then(response => response.json())
}
​
const systemSelected = async () => {
  document.querySelector("#selectedCamera").style.display = "block"
  cameraSelect.innerHTML = '<option value="loading">Loading Cameras...</option>'
  const defaultTrafficHRelayHost = "{systemId}.relay.vmsproxy.com"
  // @ts-expect-error
  const trafficRelayHost = await fetch(
    `${
      import.meta.env.PROD
        ? "/.netlify/functions/proxy?url="
        : "http://localhost:4242/"
    }${cloudInstance}/api/utils/settings`
  )
    .then(response => response.json())
    .then(({ trafficRelayHost }) => trafficRelayHost)
    .catch(() =>
      prompt(
        "Unable to fetch traffic relay host from cloud portal. Please enter relay url:",
        defaultTrafficHRelayHost
      )
    )
  systemRelay = `${trafficRelayHost.replace("{systemId}", systemSelect.value)}`
  systemToken = await getSystemToken(systemSelect.value)
​
  await fetch(
    `https://${systemRelay}/rest/v2/login/sessions/${systemToken.access_token}?setCookie=true`,
    { credentials: "include" }
  )
​
  cameras = await fetch(`https://${systemRelay}/rest/v2/devices`, {
    credentials: "include"
  }).then(res => res.json())
​
  const cameraAvailable = camera =>
    ["online", "recording"].includes(camera.status?.toLowerCase())
  const camerasOptions = cameras.map(
    camera =>
      `<option value="${camera.id}" ${
        cameraAvailable(camera) ? "" : "disabled"
      }>${camera.name}</option>`
  )
  cameraSelect.innerHTML = camerasOptions.join("")
  const defaultCamera = cameras.find(cameraAvailable) || cameras[0]
  cameraSelect.value = defaultCamera.id
  timeline = await fetch(
    `https://${systemRelay}/rest/v2/devices/${defaultCamera.id}/footage`,
    { credentials: "include" }
  ).then(res => res.json())
  console.log(timeline)
  const event = new Event("change")
  cameraSelect.dispatchEvent(event)
}
​
const cameraSelected = () => {
  document.querySelector('[name="endpoint-data"] button').disabled = false
}
​
instanceForm.addEventListener("submit", redirectOauth)
systemSelect.addEventListener("change", systemSelected)
cameraSelect.addEventListener("change", cameraSelected)
endpointForm.addEventListener("submit", startStreamHandler)