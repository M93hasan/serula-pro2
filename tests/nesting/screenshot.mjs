import {send,close} from './cdp.mjs';
import {writeFileSync} from 'node:fs';
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});writeFileSync('storage/ui-settings.png',Buffer.from(r.result.data,'base64'));close();
