import React, { useState } from 'react';
import { Copy, Key, RefreshCw, Lock, Unlock } from 'lucide-react';

// Bech32 encoding/decoding functions
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values) {
  let chk = 1;
  for (let v of values) {
    let top = chk >> 25;
    chk = (chk & 0x1ffffff) << 5 ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) {
        chk ^= [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3][i];
      }
    }
  }
  return chk;
}

function bech32CreateChecksum(prefix, data) {
  let values = [];
  for (let i = 0; i < prefix.length; i++) {
    values.push(prefix.charCodeAt(i) >> 5);
  }
  values.push(0);
  for (let i = 0; i < prefix.length; i++) {
    values.push(prefix.charCodeAt(i) & 31);
  }
  values = values.concat(data);
  let polymod = bech32Polymod(values.concat([0, 0, 0, 0, 0, 0])) ^ 1;
  let checksum = [];
  for (let i = 0; i < 6; i++) {
    checksum.push((polymod >> 5 * (5 - i)) & 31);
  }
  return checksum;
}

function bech32Encode(prefix, data) {
  let checksum = bech32CreateChecksum(prefix, data);
  let result = prefix + '1';
  let combined = data.concat(checksum);
  for (let d of combined) {
    result += BECH32_CHARSET.charAt(d);
  }
  return result;
}

function bech32Decode(str) {
  let lower = str.toLowerCase();
  let upper = str.toUpperCase();
  if (str !== lower && str !== upper) return null;
  str = lower;
  
  let pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length || str.length > 90) return null;
  
  let prefix = str.substring(0, pos);
  let data = [];
  for (let i = pos + 1; i < str.length; i++) {
    let d = BECH32_CHARSET.indexOf(str.charAt(i));
    if (d === -1) return null;
    data.push(d);
  }
  
  if (data.length < 6) return null;
  let values = [];
  for (let i = 0; i < prefix.length; i++) {
    values.push(prefix.charCodeAt(i) >> 5);
  }
  values.push(0);
  for (let i = 0; i < prefix.length; i++) {
    values.push(prefix.charCodeAt(i) & 31);
  }
  values = values.concat(data);
  
  if (bech32Polymod(values) !== 1) return null;
  return { prefix, data: data.slice(0, -6) };
}

function convertBits(data, fromBits, toBits, pad) {
  let acc = 0;
  let bits = 0;
  let result = [];
  let maxv = (1 << toBits) - 1;
  
  for (let value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }
  
  if (pad) {
    if (bits > 0) {
      result.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    return null;
  }
  
  return result;
}

function hexToNpub(hex) {
  let data = [];
  for (let i = 0; i < hex.length; i += 2) {
    data.push(parseInt(hex.substr(i, 2), 16));
  }
  let words = convertBits(data, 8, 5, true);
  return bech32Encode('npub', words);
}

function hexToNsec(hex) {
  let data = [];
  for (let i = 0; i < hex.length; i += 2) {
    data.push(parseInt(hex.substr(i, 2), 16));
  }
  let words = convertBits(data, 8, 5, true);
  return bech32Encode('nsec', words);
}

function bech32ToHex(bech32Str) {
  let decoded = bech32Decode(bech32Str);
  if (!decoded) return null;
  let bytes = convertBits(decoded.data, 5, 8, false);
  if (!bytes) return null;
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function NostrKeyConverter() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [keyType, setKeyType] = useState('public'); // 'public' or 'private'

  const handleConvert = (value, selectedType = keyType) => {
    setInput(value);
    setError('');
    setOutput('');
    
    if (!value.trim()) return;

    try {
      if (value.startsWith('npub')) {
        const hex = bech32ToHex(value);
        if (hex) {
          setOutput(hex);
          setKeyType('public');
        } else {
          setError('Invalid npub format');
        }
      } else if (value.startsWith('nsec')) {
        const hex = bech32ToHex(value);
        if (hex) {
          setOutput(hex);
          setKeyType('private');
        } else {
          setError('Invalid nsec format');
        }
      } else if (/^[0-9a-fA-F]{64}$/.test(value)) {
        // It's a hex key - convert based on selected type
        if (selectedType === 'public') {
          const npub = hexToNpub(value);
          setOutput(npub);
        } else {
          const nsec = hexToNsec(value);
          setOutput(nsec);
        }
      } else {
        setError('Invalid format. Enter a 64-char hex key or npub/nsec');
      }
    } catch (e) {
      setError('Conversion error. Please check your input.');
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSwap = () => {
    if (output) {
      setInput(output);
      handleConvert(output, keyType);
    }
  };

  const toggleKeyType = (type) => {
    setKeyType(type);
    if (input && /^[0-9a-fA-F]{64}$/.test(input)) {
      handleConvert(input, type);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-900 via-teal-900 to-emerald-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Key className="w-10 h-10 text-cyan-300" />
            <h1 className="text-4xl font-bold text-white">Nostr Key Converter</h1>
          </div>
          <p className="text-cyan-200">Convert between npub/nsec and hex formats</p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-white/20">
          <div className="space-y-6">
            {/* Key Type Toggle - Only show for hex input */}
            {input && /^[0-9a-fA-F]{64}$/.test(input) && (
              <div className="flex gap-2 p-1 bg-white/5 rounded-lg">
                <button
                  onClick={() => toggleKeyType('public')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-all ${
                    keyType === 'public'
                      ? 'bg-cyan-500 text-white shadow-lg'
                      : 'text-cyan-200 hover:bg-white/10'
                  }`}
                >
                  <Unlock className="w-4 h-4" />
                  <span className="font-medium">Public Key (npub)</span>
                </button>
                <button
                  onClick={() => toggleKeyType('private')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-all ${
                    keyType === 'private'
                      ? 'bg-rose-500 text-white shadow-lg'
                      : 'text-cyan-200 hover:bg-white/10'
                  }`}
                >
                  <Lock className="w-4 h-4" />
                  <span className="font-medium">Private Key (nsec)</span>
                </button>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-cyan-200 mb-2">
                Input (npub/nsec or hex)
              </label>
              <textarea
                value={input}
                onChange={(e) => handleConvert(e.target.value)}
                placeholder="npub1... or nsec1... or 64-character hex key"
                className="w-full h-32 px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent resize-none font-mono text-sm"
              />
            </div>

            {error && (
              <div className="bg-rose-500/20 border border-rose-500/50 rounded-lg p-4 text-rose-200 text-sm">
                {error}
              </div>
            )}

            {output && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-cyan-200">
                    Output
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSwap}
                      className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                      title="Swap input/output"
                    >
                      <RefreshCw className="w-4 h-4 text-cyan-200" />
                    </button>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                    >
                      <Copy className="w-4 h-4 text-cyan-200" />
                      <span className="text-sm text-cyan-200">
                        {copied ? 'Copied!' : 'Copy'}
                      </span>
                    </button>
                  </div>
                </div>
                <textarea
                  value={output}
                  readOnly
                  className="w-full h-32 px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white resize-none font-mono text-sm"
                />
              </div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-white/10">
            <div className="text-xs text-cyan-200 space-y-2">
              <p className="font-semibold">How to use:</p>
              <ul className="list-disc list-inside space-y-1 text-cyan-300">
                <li>Paste an npub to get the public key hex</li>
                <li>Paste an nsec to get the private key hex</li>
                <li>Paste a hex key and choose if it's public or private</li>
                <li>Use the swap button to quickly reverse the conversion</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="text-center mt-6 text-sm text-cyan-300">
          All conversions happen locally in your browser 🔒
        </div>
      </div>
    </div>
  );
}
