// Copyright 2018-present Network Optix, Inc. Licensed under MPL 2.0: www.mozilla.org/MPL/2.0/
​
import "./style.css";
import { description } from "../package.json";
import { Subject, takeUntil } from "rxjs";
import { WebRTCStreamManager } from "./open_check_excluded";
​
const newStream$ = new Subject();
const urlParams = new URLSearchParams(window.location.search);
let cloudInstance = window.localStorage.getItem("cloudInstance"); // let cloudInstance = "https://vue.realwave.io"
const tokenEndpoint = `${cloudInstance}/oauth/token/`; // const tokenEndpoint = `${cloudInstance}/cdb/oauth2/token`
const systemsEndpoint = `${cloudInstance}/api/systems/`;
const systemAuthEndpoint = (systemId) => `${systemsEndpoint}${systemId}/auth/`;
const forms = ["endpoint-data", "cloud-data"];
const endpointForm = document.querySelector('[name="endpoint-data"]');
const instanceForm = document.querySelector('[name="cloud-data"]');
const systemSelect = document.querySelector('[name="selectedSystem"]');
const cameraSelect = document.querySelector('[name="selectedCamera"]');
const videoElement = document.querySelector("video");
​
let cloudToken, systemToken, cameras, systemRelay, timeline;
​
const authCodeGrant = {
  grant_type: "authorization_code",
  response_type: "token",
  code: urlParams.get("code"),
};
​
document.querySelector("#description").innerHTML = description;
​
const headersList = {
  "Content-Type": "application/json",
};
​
const getToken = async (payload = authCodeGrant) => {
  try {
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: headersList,
    });
    return await response.json();
  } catch (error) {
    throw new Error("Error getting token: " + error.message);
  }
};
​
const show = (formName = "cloud-data") => {
  forms.forEach((form) => {
    document.querySelector(`[name="${form}"]`).style.display =
      form === formName ? "block" : "none";
  });
};
​
const compatibleOnlineSystem = (system) =>
  system.stateOfHealth === "online" && parseFloat(system.version) >= 5.1;
​
const clean = (id) => id.replace("{", "").replace("}", "");
​
const getSystemToken = async (systemId) => {
  const payload = {
    client_id: "cloud",
    grant_type: "refresh_token",
    response_type: "token",
    refresh_token: cloudToken.refresh_token,
    scope: `cloudSystemId=${systemId}`,
  };
​
  try {
    const response = await getToken(payload);
    return await response.json();
  } catch (error) {
    throw new Error("Error getting system token: " + error.message);
  }
};
​
const startStream = async (relayUrl, cameraId, serverId) => {
  const webRtcUrlFactory = () =>
    `wss://${relayUrl}/webrtc-tracker/?camera_id=${cameraId}&x-server-guid=${serverId}`;
​
  try {
    const [stream, error] = await WebRTCStreamManager.connectWithAccessToken(
      webRtcUrlFactory,
      systemToken.access_token,
      videoElement
    ).pipe(takeUntil(newStream$)).toPromise();
​
    if (stream) {
      videoElement.srcObject = stream;
      videoElement.muted = true;
      videoElement.autoplay = true;
    }
​
    if (error) {
      alert("Error playing back stream");
    }
  } catch (error) {
    console.error("Error starting stream: " + error.message);
  }
};
​
const startStreamHandler = async (event) => {
  event.preventDefault();
  newStream$.next();
​
  try {
    const data = new FormData(endpointForm);
    const selectedCamera = clean(data.get("selectedCamera"));
    const targetServer = clean(
      cameras.find((camera) => clean(camera.id) === selectedCamera).serverId
    );
​
    await startStream(systemRelay, selectedCamera, targetServer);
  } catch (error) {
    console.error("Error in startStreamHandler: " + error.message);
  }
};
​
const redirectOauth = (event) => {
  event.preventDefault();
  const cloudInstance = new FormData(instanceForm).get("cloudInstance");
  window.localStorage.setItem("cloudInstance", cloudInstance);
  const authorizationUrl = `${cloudInstance}/authorize?redirect_uri=${window.location.href}`;
  window.location.href = authorizationUrl;
};
​
const systemSelected = async () => {
  document.querySelector("#selectedCamera").style.display = "block";
  cameraSelect.innerHTML = '<option value="loading">Loading Cameras...</option>';
​
  const defaultTrafficHRelayHost = "{systemId}.relay.vmsproxy.com";
  try {
    const response = await fetch(
      `${
        import.meta.env.PROD
          ? "/.netlify/functions/proxy?url="
          : "http://localhost:4242/"
      }${cloudInstance}/api/utils/settings`
    );
    const { trafficRelayHost } = await response.json();
    systemRelay = `${trafficRelayHost.replace("{systemId}", systemSelect.value)}`;
    systemToken = await getSystemToken(systemSelect.value);
​
    await fetch(
      `https://${systemRelay}/rest/v2/login/sessions/${systemToken.access_token}?setCookie=true`,
      { credentials: "include" }
    );
​
    cameras = await fetch(`https://${systemRelay}/rest/v2/devices`, {
      credentials: "include",
    }).then((res) => res.json());
​
    const cameraAvailable = (camera) =>
      ["online", "recording"].includes(camera.status?.toLowerCase());
    const camerasOptions = cameras.map(
      (camera) =>
        `<option value="${camera.id}" ${
          cameraAvailable(camera) ? "" : "disabled"
        }>${camera.name}</option>`
    );
    cameraSelect.innerHTML = camerasOptions.join("");
    const defaultCamera = cameras.find(cameraAvailable) || cameras[0];
    cameraSelect.value = defaultCamera.id;
    timeline = await fetch(
      `https://${systemRelay}/rest/v2/devices/${defaultCamera.id}/footage`,
      { credentials: "include" }
    ).then((res) => res.json());
    console.log(timeline);
    const event = new Event("change");
    cameraSelect.dispatchEvent(event);
  } catch (error) {
    console.error("Error in systemSelected: " + error.message);
  }
};
​
const cameraSelected = () => {
  document.querySelector('[name="endpoint-data"] button').disabled = false;
};
​
if (urlParams.has("code")) {
  try {
    const response = await getToken();
    const data = await response.json();
    cloudToken = data;
    const hardcodedUsername = 'portal23@realwave.io';
    const hardcodedPassword = '23rea!Vue';
​
    // Authenticate using hardcoded credentials
    // const authResponse = await fetch(tokenEndpoint, {
    //   method: 'POST',
    //   body: JSON.stringify({
    //     grant_type: 'password',
    //     username: hardcodedUsername,
    //     password: hardcodedPassword
    //   }),
    //   headers: headersList,
    // });
​
    // const authData = await authResponse.json();
    // cloudToken = authData;
​
    show("endpoint-data");
​
    const accessToken = data.access_token;
​
    const systemsResponse = await fetch(systemsEndpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const systems = await systemsResponse.json();
​
    const systemOptions = systems.map((system) =>
      `<option value="${system.id}" ${
        compatibleOnlineSystem(system) ? "" : "disabled"
      }>${system.name}</option>`
    );
​
    systemSelect.innerHTML = systemOptions.join("");
    const defaultSystem =
      systems.find(compatibleOnlineSystem) || systems[0];
​
    systemSelect.value = defaultSystem.id;
​
    const event = new Event("change");
    systemSelect.dispatchEvent(event);
  } catch (error) {
    console.error("Error during initialization: " + error.message);
    show();
  } finally {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
} else {
  show();
}
​
instanceForm.addEventListener("submit", redirectOauth);
systemSelect.addEventListener("change", systemSelected);
cameraSelect.addEventListener("change", cameraSelected);
endpointForm.addEventListener("submit", startStreamHandler);
