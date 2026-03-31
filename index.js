#!/usr/bin/env node

const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require('dotenv').config();
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync, spawn } = require('child_process');

function parseBool(val, defaultVal) {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.toLowerCase().trim();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
  }
  return defaultVal;
}

const AUTO_ACCESS = parseBool(process.env.AUTO_ACCESS, false);
const YT_WARPOUT = parseBool(process.env.YT_WARPOUT, false);
const FILE_PATH = process.env.FILE_PATH || '.cache';
const SUB_PATH = process.env.SUB_PATH || 'subb';

const UUID = process.env.UUID || '26fbd6ba-3660-4058-a3c2-310bef5419fd';
const KOMARI_SERVER = process.env.KOMARI_SERVER || ''; // e.g. https://km.example.com
const KOMARI_KEY = process.env.KOMARI_KEY || '';
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || '';

const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';
const ARGO_AUTH = process.env.ARGO_AUTH || '';
const ARGO_PORT = process.env.ARGO_PORT || 8001;
const ARGO_VMESS_PORT = parseInt(ARGO_PORT, 10) + 1;
const CFIP = process.env.CFIP || 'sub.danfeng.eu.org';
const CFPORT = process.env.CFPORT || 443;
const DISABLE_ARGO = parseBool(process.env.DISABLE_ARGO, true); // false/true

const TUIC_PORT = process.env.TUIC_PORT || '';
const HY2_PORT = process.env.HY2_PORT || '';
const HY2_OBFS = parseBool(process.env.HY2_OBFS, false); // ture/false
const ANYTLS_PORT = process.env.ANYTLS_PORT || '';
const S5_PORT = process.env.S5_PORT || '';
const REALITY_PORT = process.env.REALITY_PORT || '';
const ANYREALITY_PORT = process.env.ANYREALITY_PORT || '';
const REALITY_DOMAIN = process.env.REALITY_DOMAIN || 'www.iij.ad.jp';
const NAME = process.env.NAME || '';
const DOMAIN_NAME = process.env.DOMAIN_NAME || '';
const DOMAIN_CERT = process.env.DOMAIN_CERT || '';
const DOMAIN_KEY = process.env.DOMAIN_KEY || '';

const PORT = process.env.PORT || 3000;
const CHAT_ID = process.env.CHAT_ID || '';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const UPLOAD_URL = process.env.UPLOAD_URL || '';
const PROJECT_URL = process.env.PROJECT_URL || '';

// Create working directory
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH, { recursive: true });
  console.log(`${FILE_PATH} has been created`);
} else {
  console.log(`${FILE_PATH} already exists`);
}

// Global Variables
let privateKey = '';
let publicKey = '';
let shortId = '';
let tuicPassword = '';
let socksPassword = '';
let hy2Password = '';
let useCustomCert = false;
let domainName = '';

// Generate a random 6-character string for obfuscation
function generateRandomName() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Random executable names
const npmRandomName = generateRandomName();
const webRandomName = generateRandomName();
const botRandomName = generateRandomName();
const phpRandomName = generateRandomName();
const kmRandomName = generateRandomName();

// Paths
const npmPath = path.join(FILE_PATH, npmRandomName);
const phpPath = path.join(FILE_PATH, phpRandomName);
const webPath = path.join(FILE_PATH, webRandomName);
const botPath = path.join(FILE_PATH, botRandomName);
const kmPath = path.join(FILE_PATH, kmRandomName);
const subPath = path.join(FILE_PATH, 'sub.txt');
const listPath = path.join(FILE_PATH, 'list.txt');
const bootLogPath = path.join(FILE_PATH, 'boot.log');
const configPath = path.join(FILE_PATH, 'config.json');

const kmState = {
  proc: null,
  crashCount: 0,
  stopped: false,
};

function startKomari(binPath, endpoint, token) {
  if (kmState.stopped) return;

  const startTime = Date.now();
  const proc = spawn(binPath, ['-e', endpoint, '-t', token], {
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: false,
  });

  kmState.proc = proc;

  proc.on('error', () => {
    kmState.stopped = true;
  });

  proc.on('close', () => {
    kmState.proc = null;
    if (kmState.stopped) return;

    const liveMs = Date.now() - startTime;
    if (liveMs > 30000) {
      kmState.crashCount = 0;
    } else {
      kmState.crashCount++;
    }

    const delayMs = Math.min(2000 * Math.pow(2, kmState.crashCount), 60000);
    setTimeout(() => startKomari(binPath, endpoint, token), delayMs);
  });
}

// Delete old nodes remotely if applicable
function deleteNodes() {
  if (!UPLOAD_URL) return;
  if (!fs.existsSync(subPath)) return;

  try {
    const fileContent = fs.readFileSync(subPath, 'utf-8');
    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line => 
      /(vless|vmess|trojan|hysteria2|tuic|anytls|socks):\/\//.test(line)
    );

    if (nodes.length === 0) return;

    axios.post(`${UPLOAD_URL}/api/delete-nodes`, 
      JSON.stringify({ nodes }),
      { headers: { 'Content-Type': 'application/json' } }
    ).catch(() => { });
  } catch (err) {
    // Ignore errors
  }
}

// Port Validator
function isValidPort(port) {
  try {
    if (port === null || port === undefined || port === '') return false;
    if (typeof port === 'string' && port.trim() === '') return false;
    const portNum = parseInt(port, 10);
    if (isNaN(portNum)) return false;
    if (portNum < 1 || portNum > 65535) return false;
    return true;
  } catch (error) {
    return false;
  }
}

// Cleanup initialization files
function cleanupOldFiles() {
  const pathsToDelete =[webRandomName, botRandomName, npmRandomName, kmRandomName, 'boot.log', 'list.txt'];
  pathsToDelete.forEach(file => {
    const fPath = path.join(FILE_PATH, file);
    if (fs.existsSync(fPath)) {
      fs.unlink(fPath, () => {});
    }
  });
}

// Setup Argo configuration
function argoType() {
  if (DISABLE_ARGO) {
    console.log("DISABLE_ARGO is set to true. Argo tunnel is disabled.");
    return;
  }

  if (!ARGO_AUTH || !ARGO_DOMAIN) {
    console.log("ARGO_DOMAIN or ARGO_AUTH is empty. Using quick tunnels.");
    return;
  }

  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelId = ARGO_AUTH.split('"')[11];
    const tunnelYaml = `
tunnel: ${tunnelId}
credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
protocol: http2

ingress:
  - hostname: ${ARGO_DOMAIN}
    path: /vless-argo
    service: http://localhost:${ARGO_PORT}
    originRequest:
      noTLSVerify: true
  - hostname: ${ARGO_DOMAIN}
    path: /vmess-argo
    service: http://localhost:${ARGO_VMESS_PORT}
    originRequest:
      noTLSVerify: true
  - service: http_status:404
`;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
  } else {
    console.log("ARGO_AUTH mismatch TunnelSecret. Using token to connect to tunnel.");
  }
}

// Get OS Architecture
function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    return 'arm';
  } else {
    return 'amd';
  }
}

// Execute Promise Wrapper
function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout || stderr);
    });
  });
}

// Download utility
function downloadFile(fileName, fileUrl) {
  return new Promise((resolve, reject) => {
    const fPath = path.join(FILE_PATH, fileName);
    const writer = fs.createWriteStream(fPath);

    axios({
      method: 'get',
      url: fileUrl,
      responseType: 'stream',
      timeout: 15000
    }).then(response => {
      response.data.pipe(writer);
      writer.on('finish', () => {
        writer.close();
        console.log(`Downloaded ${fileName} successfully`);
        resolve();
      });
      writer.on('error', err => {
        fs.unlink(fPath, () => { });
        console.error(`Download of ${fileName} failed: ${err.message}`);
        reject(err);
      });
    }).catch(err => {
      console.error(`Download of ${fileName} failed: ${err.message}`);
      reject(err);
    });
  });
}

// Map files for Architecture
function getFilesForArchitecture(architecture) {
  let baseFiles =[];
  if (architecture === 'arm') {
    baseFiles.push({ fileName: webRandomName, fileUrl: "https://arm64.ssss.nyc.mn/sb" });
    baseFiles.push({ fileName: botRandomName, fileUrl: "https://arm64.ssss.nyc.mn/2go" });
  } else {
    baseFiles.push({ fileName: webRandomName, fileUrl: "https://amd64.ssss.nyc.mn/sb" });
    baseFiles.push({ fileName: botRandomName, fileUrl: "https://amd64.ssss.nyc.mn/2go" });
  }

  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT) {
      const npmUrl = architecture === 'arm' ? "https://arm64.ssss.nyc.mn/agent" : "https://amd64.ssss.nyc.mn/agent";
      baseFiles.unshift({ fileName: npmRandomName, fileUrl: npmUrl });
    } else {
      const phpUrl = architecture === 'arm' ? "https://arm64.ssss.nyc.mn/v1" : "https://amd64.ssss.nyc.mn/v1";
      baseFiles.unshift({ fileName: phpRandomName, fileUrl: phpUrl });
    }
  }

  if (KOMARI_SERVER && KOMARI_KEY) {
    const kmUrl = architecture === 'arm' ? "https://rt.jp.eu.org/nucleusp/K/Karm" : "https://rt.jp.eu.org/nucleusp/K/Kamd";
    baseFiles.push({ fileName: kmRandomName, fileUrl: kmUrl });
  }

  return baseFiles;
}

// Main Bootstrap logic
async function downloadFilesAndRun() {
  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);

  if (filesToDownload.length === 0) return;

  try {
    const downloadPromises = filesToDownload.map(file => downloadFile(file.fileName, file.fileUrl));
    await Promise.all(downloadPromises);
  } catch (err) {
    console.error('Error downloading core binaries:', err);
    return;
  }

  // Grant Execution Permissions
  const filesToAuthorize = [webRandomName, botRandomName];
  if (NEZHA_PORT) filesToAuthorize.push(npmRandomName);
  else if (NEZHA_SERVER) filesToAuthorize.push(phpRandomName);
  if (KOMARI_SERVER && KOMARI_KEY) filesToAuthorize.push(kmRandomName);

  filesToAuthorize.forEach(fileName => {
    const absPath = path.join(FILE_PATH, fileName);
    if (fs.existsSync(absPath)) {
      try {
        fs.chmodSync(absPath, 0o775);
        console.log(`Empowered ${absPath}: 775`);
      } catch (err) {
        console.error(`Failed to empower ${absPath}: ${err.message}`);
      }
    }
  });

  // Load or Generate Persistence Data
  const persistFile = path.join(FILE_PATH, 'persist.json');
  let needGenerate = true;

  if (fs.existsSync(persistFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(persistFile, 'utf8'));
      if (data.privateKey && data.publicKey && data.shortId && data.tuicPassword && data.socksPassword) {
        privateKey = data.privateKey;
        publicKey = data.publicKey;
        shortId = data.shortId;
        tuicPassword = data.tuicPassword;
        socksPassword = data.socksPassword;
        hy2Password = data.hy2Password || crypto.randomBytes(16).toString('hex');
        needGenerate = false;
        
        if (!data.hy2Password) {
            fs.writeFileSync(persistFile, JSON.stringify({
                privateKey, publicKey, shortId, tuicPassword, socksPassword, hy2Password
            }));
        }
        
        console.log("Successfully loaded persisted keys and passwords.");
      }
    } catch (e) {
      console.error("Error reading persist file:", e.message);
    }
  }

  if (needGenerate) {
    console.log("Generating new keys and passwords...");
    try {
      const keypairOutput = await execPromise(`${webPath} generate reality-keypair`);
      const privateMatch = keypairOutput.match(/PrivateKey:\s*(.*)/);
      const publicMatch = keypairOutput.match(/PublicKey:\s*(.*)/);
      
      if (privateMatch && publicMatch) {
        privateKey = privateMatch[1].trim();
        publicKey = publicMatch[1].trim();
      } else {
        console.error("Failed to extract privateKey or publicKey.");
        return;
      }

      shortId = crypto.randomBytes(4).toString('hex');
      tuicPassword = crypto.randomBytes(16).toString('hex');
      socksPassword = crypto.randomBytes(8).toString('hex');
      hy2Password = crypto.randomBytes(16).toString('hex');

      fs.writeFileSync(persistFile, JSON.stringify({
        privateKey, publicKey, shortId, tuicPassword, socksPassword, hy2Password
      }));
    } catch (err) {
      console.error(`Error generating keypair: ${err.message}`);
      return;
    }
  }

  let certPath = path.join(FILE_PATH, 'tls_cert.pem');
  let keyPath = path.join(FILE_PATH, 'tls_private.key');
  domainName = DOMAIN_NAME || "www.bing.com";

  if (DOMAIN_CERT && DOMAIN_KEY && DOMAIN_NAME) {
    console.log("Attempting to download custom certificates...");
    try {
      await Promise.all([
        downloadFile('custom_cert.pem', DOMAIN_CERT),
        downloadFile('custom_private.key', DOMAIN_KEY)
      ]);
      useCustomCert = true;
      certPath = path.join(FILE_PATH, 'custom_cert.pem');
      keyPath = path.join(FILE_PATH, 'custom_private.key');
      domainName = DOMAIN_NAME;
      console.log(`Successfully applied custom certificate for ${domainName}`);
    } catch (err) {
      console.log("Failed to download custom certificates. Falling back to self-signed.");
    }
  }

  if (!useCustomCert) {
    domainName = "www.bing.com";
    console.log("Generating self-signed certificate...");
    try {
      await execPromise('which openssl || where.exe openssl');
      await execPromise(`openssl ecparam -genkey -name prime256v1 -out "${keyPath}"`);
      await execPromise(`openssl req -new -x509 -days 3650 -key "${keyPath}" -out "${certPath}" -subj "/CN=${domainName}"`);
    } catch (err) {
      console.log("OpenSSL not found or failed, using predefined certificate and key files.");
      const predefinedPriv = `-----BEGIN EC PARAMETERS-----\nBggqhkjOPQMBBw==\n-----END EC PARAMETERS-----\n-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIM4792SEtPqIt1ywqTd/0bYidBqpYV/++siNnfBYsdUYoAoGCCqGSM49\nAwEHoUQDQgAE1kHafPj07rJG+HboH2ekAI4r+e6TL38GWASANnngZreoQDF16ARa\n/TsyLyFoPkhLxSbehH/NBEjHtSZGaDhMqQ==\n-----END EC PRIVATE KEY-----`;
      const predefinedCert = `-----BEGIN CERTIFICATE-----\nMIIBejCCASGgAwIBAgIUfWeQL3556PNJLp/veCFxGNj9crkwCgYIKoZIzj0EAwIw\nEzERMA8GA1UEAwwIYmluZy5jb20wHhcNMjUwOTE4MTgyMDIyWhcNMzUwOTE2MTgy\nMDIyWjATMREwDwYDVQQDDAhiaW5nLmNvbTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABNZB2nz49O6yRvh26B9npACOK/nuky9/BlgEgDZ54Ga3qEAxdegEWv07Mi8h\naD5IS8Um3oR/zQRIx7UmRmg4TKmjUzBRMB0GA1UdDgQWBBTV1cFID7UISE7PLTBR\nBfGbgkrMNzAfBgNVHSMEGDAWgBTV1cFID7UISE7PLTBRBfGbgkrMNzAPBgNVHRMB\nAf8EBTADAQH/MAoGCCqGSM49BAMCA0cAMEQCIAIDAJvg0vd/ytrQVvEcSm6XTlB+\neQ6OFb9LbLYL9f+sAiAffoMbi4y/0YUSlTtz7as9S8/lciBF5VCUoVIKS+vX2g==\n-----END CERTIFICATE-----`;
      fs.writeFileSync(keyPath, predefinedPriv);
      fs.writeFileSync(certPath, predefinedCert);
    }
  }

  const portSegment = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
  const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
  const nezhatls = tlsPorts.has(portSegment) ? 'true' : 'false';

  if (NEZHA_SERVER && NEZHA_KEY && !NEZHA_PORT) {
    const configYaml = `
client_secret: ${NEZHA_KEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: true
ip_report_period: 1800
report_delay: 4
server: ${NEZHA_SERVER}
skip_connection_count: true
skip_procs_count: true
temperature: false
tls: ${nezhatls}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;
    fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
  }

  // Core Configuration JSON
  const config = {
    log: { disabled: true, level: "error", timestamp: true },
    inbounds:[
      {
        tag: "vless-ws-in",
        type: "vless",
        listen: "::",
        listen_port: parseInt(ARGO_PORT, 10),
        users:[{ uuid: UUID, flow: "" }],
        transport: {
          type: "ws",
          path: "/vless-argo",
          early_data_header_name: "Sec-WebSocket-Protocol"
        }
      },
      {
        tag: "vmess-ws-in",
        type: "vmess",
        listen: "::",
        listen_port: parseInt(ARGO_VMESS_PORT, 10),
        users: [{ uuid: UUID }],
        transport: {
          type: "ws",
          path: "/vmess-argo",
          early_data_header_name: "Sec-WebSocket-Protocol"
        }
      }
    ],
    endpoints:[
      {
        type: "wireguard",
        tag: "wireguard-out",
        mtu: 1280,
        address:[
            "172.16.0.2/32",
            "2606:4700:110:8dfe:d141:69bb:6b80:925/128"
        ],
        private_key: "YFYOAdbw1bKTHlNNi+aEjBM3BO7unuFC5rOkMRAz9XY=",
        peers:[
          {
            address: "engage.cloudflareclient.com",
            port: 2408,
            public_key: "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=",
            allowed_ips:["0.0.0.0/0", "::/0"],
            reserved:[78, 135, 76]
          }
        ]
      }
    ],
    outbounds:[{ type: "direct", tag: "direct" }],
    route: {
      rule_set:[
        {
          tag: "netflix", type: "remote", format: "binary",
          url: "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/netflix.srs",
          download_detour: "direct"
        },
        {
          tag: "openai", type: "remote", format: "binary",
          url: "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/openai.srs",
          download_detour: "direct"
        }
      ],
      rules: [{ rule_set:["openai", "netflix"], outbound: "wireguard-out" }],
      final: "direct"
    }
  };

  if (isValidPort(REALITY_PORT)) {
    config.inbounds.push({
      tag: "vless-in", type: "vless", listen: "::", listen_port: parseInt(REALITY_PORT, 10),
      users:[{ uuid: UUID, flow: "xtls-rprx-vision" }],
      tls: {
        enabled: true, server_name: REALITY_DOMAIN,
        reality: {
          enabled: true, handshake: { server: REALITY_DOMAIN, server_port: 443 },
          private_key: privateKey, short_id:[shortId]
        }
      }
    });
  }

  if (isValidPort(HY2_PORT)) {
    const hyConf = {
      tag: "hysteria-in", type: "hysteria2", listen: "::", listen_port: parseInt(HY2_PORT, 10),
      users: [{ password: UUID }],
      masquerade: "https://www.bing.com",
      tls: { enabled: true, certificate_path: certPath, key_path: keyPath }
    };
    if (HY2_OBFS) {
      hyConf.obfs = { type: "salamander", password: hy2Password };
    }
    config.inbounds.push(hyConf);
  }

  if (isValidPort(TUIC_PORT)) {
    config.inbounds.push({
      tag: "tuic-in", type: "tuic", listen: "::", listen_port: parseInt(TUIC_PORT, 10),
      users:[{ uuid: UUID, password: tuicPassword }],
      congestion_control: "bbr",
      tls: { enabled: true, alpn: ["h3"], certificate_path: certPath, key_path: keyPath }
    });
  }

  if (isValidPort(S5_PORT)) {
    config.inbounds.push({
      tag: "s5-in", type: "socks", listen: "::", listen_port: parseInt(S5_PORT, 10),
      users:[{ username: UUID.substring(0, 8), password: socksPassword }]
    });
  }

  if (isValidPort(ANYTLS_PORT)) {
    config.inbounds.push({
      tag: "anytls-in", type: "anytls", listen: "::", listen_port: parseInt(ANYTLS_PORT, 10),
      users: [{ password: UUID }],
      tls: { enabled: true, certificate_path: certPath, key_path: keyPath }
    });
  }

  if (isValidPort(ANYREALITY_PORT)) {
    config.inbounds.push({
      tag: "anyreality-in", type: "anytls", listen: "::", listen_port: parseInt(ANYREALITY_PORT, 10),
      users: [{ password: UUID }],
      tls: {
        enabled: true, server_name: REALITY_DOMAIN,
        reality: {
          enabled: true, handshake: { server: REALITY_DOMAIN, server_port: 443 },
          private_key: privateKey, short_id: [shortId]
        }
      }
    });
  }

  // YouTube Outbound Routing Detection
  try {
    let isYouTubeAccessible = true;
    if (YT_WARPOUT) {
      isYouTubeAccessible = false;
    } else {
      try {
        const youtubeTest = execSync('curl -o /dev/null -m 2 -s -w "%{http_code}" https://www.youtube.com', { encoding: 'utf8' }).trim();
        isYouTubeAccessible = (youtubeTest === '200');
      } catch (err) {
        isYouTubeAccessible = false;
      }
    }

    if (!isYouTubeAccessible) {
      if (!config.route.rule_set.find(rule => rule.tag === 'youtube')) {
        config.route.rule_set.push({
          tag: "youtube", type: "remote", format: "binary",
          url: "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/youtube.srs",
          download_detour: "direct"
        });
      }
      let wireguardRule = config.route.rules.find(rule => rule.outbound === 'wireguard-out');
      if (!wireguardRule) {
        wireguardRule = { rule_set: ["openai", "netflix", "youtube"], outbound: "wireguard-out" };
        config.route.rules.push(wireguardRule);
      } else if (!wireguardRule.rule_set.includes('youtube')) {
        wireguardRule.rule_set.push('youtube');
      }
      console.log('Added YouTube outbound rule routing via WireGuard.');
    }
  } catch (error) {
    // Ignore YouTube check error
  }

  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));

  // Run Nezha
  if (NEZHA_SERVER && NEZHA_PORT && NEZHA_KEY) {
    const nTls = tlsPorts.has(NEZHA_PORT) ? '--tls' : '';
    const cmd = `nohup ${npmPath} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${nTls} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`;
    exec(cmd, () => {});
    console.log('Nezha Agent is running');
  } else if (NEZHA_SERVER && NEZHA_KEY) {
    exec(`nohup ${phpPath} -c "${FILE_PATH}/config.yaml" >/dev/null 2>&1 &`, () => {});
    console.log('Nezha Agent is running');
  }

  // Run Komari Probe (Spawn and Auto-Restart Guarded)
  if (KOMARI_SERVER && KOMARI_KEY) {
    const kServer = KOMARI_SERVER.startsWith('http') ? KOMARI_SERVER : `https://${KOMARI_SERVER}`;
    startKomari(kmPath, kServer, KOMARI_KEY);
    console.log('Komari probe is running on', kServer);
  }

  // Run Core Service
  exec(`nohup ${webPath} run -c ${configPath} >/dev/null 2>&1 &`, () => {});
  console.log('Web service is running');

  // Run Cloudflared Bot
  if (!DISABLE_ARGO && fs.existsSync(botPath)) {
    let args;
    if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
    } else if (ARGO_AUTH.match(/TunnelSecret/)) {
      args = `tunnel --edge-ip-version auto --config ${path.join(FILE_PATH, 'tunnel.yml')} run`;
    } else {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${bootLogPath} --loglevel info --url http://localhost:${ARGO_PORT}`;
    }
    exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`, () => {});
    console.log('Bot is running');
  }

  setTimeout(() => {
    extractDomains();
  }, 5000);
}

// Extract Domains from Logs
async function extractDomains() {
  if (DISABLE_ARGO) {
    await generateLinks(null);
    return;
  }

  if (ARGO_AUTH && ARGO_DOMAIN) {
    console.log('ARGO_DOMAIN:', ARGO_DOMAIN);
    await generateLinks(ARGO_DOMAIN);
  } else {
    try {
      if (fs.existsSync(bootLogPath)) {
        const fileContent = fs.readFileSync(bootLogPath, 'utf-8');
        const lines = fileContent.split('\n');
        const argoDomains =[];
        lines.forEach(line => {
          const match = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
          if (match) argoDomains.push(match[1]);
        });

        if (argoDomains.length > 0) {
          console.log('ArgoDomain:', argoDomains[0]);
          await generateLinks(argoDomains[0]);
        } else {
          console.log('ArgoDomain not found, restarting bot to retrieve ArgoDomain.');
          fs.unlinkSync(bootLogPath);
          try { await execPromise(`pkill -f "${botRandomName}" > /dev/null 2>&1`); } catch (err) {}
          await new Promise(r => setTimeout(r, 1000));
          const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${bootLogPath} --loglevel info --url http://localhost:${ARGO_PORT}`;
          exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
          setTimeout(() => extractDomains(), 6000);
        }
      } else {
        setTimeout(() => extractDomains(), 2000);
      }
    } catch (error) {
      // Ignore
    }
  }
}

// Fetch ISP Data
async function getMetaInfo() {
  try {
    const res = await axios.get('https://api.ip.sb/geoip', { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 3000 });
    if (res.data && res.data.country_code && res.data.isp) {
      return `${res.data.country_code}-${res.data.isp}`.replace(/\s+/g, '_');
    }
  } catch (error) {
    try {
      const res2 = await axios.get('http://ip-api.com/json', { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 3000 });
      if (res2.data && res2.data.status === 'success' && res2.data.countryCode && res2.data.org) {
        return `${res2.data.countryCode}-${res2.data.org}`.replace(/\s+/g, '_');
      }
    } catch (err) { }
  }
  return 'Unknown';
}

// Generate Links and Subscription File
async function generateLinks(argoDomain) {
  let SERVER_IP = '';
  try {
    const ipv4 = await axios.get('http://ipv4.ip.sb', { timeout: 3000 });
    SERVER_IP = ipv4.data.trim();
  } catch (err) {
    try { SERVER_IP = execSync('curl -sm 3 ipv4.ip.sb').toString().trim(); }
    catch (e) {
      try {
        const ipv6 = await axios.get('http://ipv6.ip.sb', { timeout: 3000 });
        SERVER_IP = `[${ipv6.data.trim()}]`;
      } catch (e2) {
        try { SERVER_IP = `[${execSync('curl -sm 3 ipv6.ip.sb').toString().trim()}]`; } catch (e3) {}
      }
    }
  }

  const ISP = await getMetaInfo();
  const nodeName = NAME ? `${NAME}-${ISP}` : ISP;

  setTimeout(() => {
    let subTxt = '';

    if (!DISABLE_ARGO && argoDomain) {
      const vlessPath = encodeURIComponent('/vless-argo?ed=2560');
      const vlessLink = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&type=ws&host=${argoDomain}&path=${vlessPath}&fp=firefox#${nodeName}-VLESS`;
      subTxt = `${vlessLink}`;

      if (ARGO_AUTH) {
        const vmessConfig = {
          v: '2', ps: `${nodeName}-VMess`, add: CFIP, port: CFPORT, id: UUID, aid: '0',
          scy: 'auto', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560',
          tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox'
        };
        subTxt += `\nvmess://${Buffer.from(JSON.stringify(vmessConfig)).toString('base64')}`;
      }
    }

    if (isValidPort(TUIC_PORT)) {
      const insecureFlag = useCustomCert ? "" : "&allow_insecure=1";
      subTxt += `\ntuic://${UUID}:${tuicPassword}@${SERVER_IP}:${TUIC_PORT}?sni=${domainName}&congestion_control=bbr&udp_relay_mode=native&alpn=h3${insecureFlag}#${nodeName}`;
    }

    if (isValidPort(HY2_PORT)) {
      const insecureFlag = useCustomCert ? "" : "&insecure=1";
      if (HY2_OBFS) {
        subTxt += `\nhysteria2://${UUID}@${SERVER_IP}:${HY2_PORT}/?sni=${domainName}&obfs=salamander&obfs-password=${hy2Password}${insecureFlag}#${nodeName}`;
      } else {
        subTxt += `\nhysteria2://${UUID}@${SERVER_IP}:${HY2_PORT}/?sni=${domainName}&obfs=none${insecureFlag}#${nodeName}`;
      }
    }

    if (isValidPort(REALITY_PORT)) {
      subTxt += `\nvless://${UUID}@${SERVER_IP}:${REALITY_PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${REALITY_DOMAIN}&fp=firefox&pbk=${publicKey}&sid=${shortId}&type=tcp&headerType=none#${nodeName}`;
    }

    if (isValidPort(ANYTLS_PORT)) {
      const insecureFlag = useCustomCert ? "" : "&insecure=1&allowInsecure=1";
      subTxt += `\nanytls://${UUID}@${SERVER_IP}:${ANYTLS_PORT}?security=tls&sni=${domainName}${insecureFlag}#${nodeName}`;
    }

    if (isValidPort(ANYREALITY_PORT)) {
      subTxt += `\nanytls://${UUID}@${SERVER_IP}:${ANYREALITY_PORT}?security=reality&sni=${REALITY_DOMAIN}&fp=firefox&pbk=${publicKey}&sid=${shortId}&type=tcp&headerType=none#${nodeName}`;
    }

    if (isValidPort(S5_PORT)) {
      const S5_AUTH = Buffer.from(`${UUID.substring(0, 8)}:${socksPassword}`).toString('base64');
      subTxt += `\nsocks://${S5_AUTH}@${SERVER_IP}:${S5_PORT}#${nodeName}`;
    }

    const encodedSub = Buffer.from(subTxt).toString('base64');
    console.log('\x1b[32m' + encodedSub + '\x1b[0m');
    console.log('\x1b[35m' + '\nLogs will be deleted in 90 seconds, you can copy the above nodes now.' + '\x1b[0m');
    
    fs.writeFileSync(subPath, encodedSub);
    fs.writeFileSync(listPath, subTxt, 'utf8');
    
    sendTelegram();
    uploadNodes();

    app.get(`/${SUB_PATH}`, (req, res) => {
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(encodedSub);
    });
  }, 2000);
}

// Scheduled Cleanup 
function cleanFiles() { 
  setTimeout(() => { 

    const filesToDelete = [
      bootLogPath,
      configPath,
      listPath,
      webPath,
      botPath,
      phpPath,
      npmPath,
      kmPath
    ]; 

    filesToDelete.forEach(file => { 
      try { 
        if (fs.existsSync(file)) fs.unlinkSync(file); 
      } catch (e) {} 
    }); 
 
    console.clear(); 
    console.log('App is successfully running.\nThank you for using this script, enjoy!'); 

  }, 90000); 
}

// Telegram Push
async function sendTelegram() {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    const message = fs.readFileSync(subPath, 'utf8');
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const escapedName = NAME.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
    const params = {
      chat_id: CHAT_ID,
      text: `**${escapedName} Node Push Notification**\n\`\`\`\n${message}\n\`\`\``,
      parse_mode: 'MarkdownV2'
    };
    await axios.post(url, null, { params });
  } catch (error) {
    // Ignore push errors
  }
}

// Upload Data Nodes
async function uploadNodes() {
  if (UPLOAD_URL && PROJECT_URL) {
    try {
      await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, { subscription:[`${PROJECT_URL}/${SUB_PATH}`] }, { headers: { 'Content-Type': 'application/json' }});
    } catch (e) {}
  } else if (UPLOAD_URL) {
    if (!fs.existsSync(listPath)) return;
    const content = fs.readFileSync(listPath, 'utf-8');
    const nodes = content.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic|anytls|socks):\/\//.test(line));
    if (nodes.length === 0) return;
    try {
      await axios.post(`${UPLOAD_URL}/api/add-nodes`, JSON.stringify({ nodes }), { headers: { 'Content-Type': 'application/json' }});
    } catch (e) {}
  }
}

// Automated Keep-Alive
async function addVisitTask() {
  if (!AUTO_ACCESS || !PROJECT_URL) return;
  try {
    await axios.post('https://keep.gvrander.eu.org/add-url', { url: PROJECT_URL }, { headers: { 'Content-Type': 'application/json' }});
  } catch (error) {}
}

// Initialize Application
async function startServer() {
  deleteNodes();
  cleanupOldFiles();
  argoType();
  await downloadFilesAndRun();
  await addVisitTask();
  cleanFiles();
}
startServer();

// 可选：去掉 Express 指纹
app.disable("x-powered-by");

// Root Web Route
app.get("/", async (req, res) => {
  const indexPath = path.join(__dirname, "index.html");

  const fakeNginxPage = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Welcome to nginx!</title>
        <style>
            body {
                width: 35em;
                margin: 0 auto;
                font-family: Tahoma, Verdana, Arial, sans-serif;
            }
        </style>
    </head>
    <body>
        <h1>Welcome to nginx!</h1>
        <p>If you see this page, the nginx web server is successfully installed and working.</p>
        <p>For online documentation and support please refer to nginx.org.</p>
    </body>
    </html>
  `;

  // Root Web Route
  try {
    if (fs.existsSync(indexPath)) {
      const data = await fs.promises.readFile(indexPath, "utf8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(data);
    } else {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(fakeNginxPage);
    }
  } catch (err) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(fakeNginxPage);
  }
});

app.listen(PORT, () =>
  console.log(`Server is running on port: ${PORT}`)
);
