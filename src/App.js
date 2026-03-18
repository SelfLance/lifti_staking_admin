import { useState, useCallback } from "react";
import { ethers } from "ethers";
import "./App.css";

const CONTRACT_ADDRESS = "0x08255708ce922dF0043664babCaA3FDE9B05d391";
const RPC_URL =
  "https://polygon-mainnet.infura.io/v3/5586420f156f4d808601c0f28d8ece8f";

const ROLES = {
  DEFAULT_ADMIN_ROLE:
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  ADMIN_ROLE: ethers.id("ADMIN_ROLE"),
};

const ABI = [
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function grantRole(bytes32 role, address account)",
  "function revokeRole(bytes32 role, address account)",
  "function renounceRole(bytes32 role, address callerConfirmation)",
];

function shortAddr(addr) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

async function fetchRoleMembers(roleName) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  const roleHash = ROLES[roleName];

  const [grantedEvents, revokedEvents] = await Promise.all([
    contract.queryFilter(contract.filters.RoleGranted(roleHash), 0, "latest"),
    contract.queryFilter(contract.filters.RoleRevoked(roleHash), 0, "latest"),
  ]);

  const revokedSet = new Set(
    revokedEvents.map((e) => e.args.account.toLowerCase())
  );

  const candidates = new Map();
  for (const e of grantedEvents) {
    const acct = e.args.account.toLowerCase();
    if (!revokedSet.has(acct)) candidates.set(acct, e.args.account);
  }

  const verified = [];
  await Promise.all(
    [...candidates.values()].map(async (account) => {
      const still = await contract.hasRole(roleHash, account);
      if (still) verified.push(account);
    })
  );
  return verified;
}

export default function App() {
  const [wallet, setWallet] = useState(null); // { address, balance, signer }
  const [connecting, setConnecting] = useState(false);

  const [defaultAdmins, setDefaultAdmins] = useState(null);
  const [admins, setAdmins] = useState(null);
  const [loadingRole, setLoadingRole] = useState(null);

  // Grant / Revoke / Renounce form state
  const [grantRole, setGrantRole] = useState("ADMIN_ROLE");
  const [grantAddress, setGrantAddress] = useState("");
  const [revokeRole, setRevokeRole] = useState("ADMIN_ROLE");
  const [revokeAddress, setRevokeAddress] = useState("");
  const [renounceRole, setRenounceRole] = useState("ADMIN_ROLE");

  const [txStatus, setTxStatus] = useState({}); // { grant, revoke, renounce }

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) return alert("No wallet detected. Install MetaMask.");
    setConnecting(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const balanceBN = await provider.getBalance(address);
      const balance = parseFloat(ethers.formatEther(balanceBN)).toFixed(4);
      setWallet({ address, balance, signer });
    } catch (e) {
      console.error(e);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectWallet = () => setWallet(null);

  const loadRole = async (roleName, setter) => {
    setLoadingRole(roleName);
    try {
      const members = await fetchRoleMembers(roleName);
      setter(members);
    } catch (e) {
      console.error(e);
      setter([]);
    } finally {
      setLoadingRole(null);
    }
  };

  const sendTx = async (action, fn) => {
    if (!wallet) return alert("Connect wallet first.");
    setTxStatus((s) => ({ ...s, [action]: { loading: true, msg: "" } }));
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = await fn(contract);
      setTxStatus((s) => ({
        ...s,
        [action]: { loading: true, msg: `Tx sent: ${shortAddr(tx.hash)}` },
      }));
      await tx.wait();
      setTxStatus((s) => ({
        ...s,
        [action]: { loading: false, msg: "Success!" },
      }));
    } catch (e) {
      setTxStatus((s) => ({
        ...s,
        [action]: { loading: false, msg: `Error: ${e.reason || e.message}` },
      }));
    }
  };

  return (
    <div className="app">
      {/* ── Top Bar ── */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-dot" />
          <h1 className="topbar-title">Admin Panel</h1>
        </div>
        <div className="wallet-area">
          {wallet ? (
            <>
              <div className="wallet-info">
                <span className="wallet-badge">{shortAddr(wallet.address)}</span>
                <span className="wallet-balance">{wallet.balance} MATIC</span>
              </div>
              <button className="btn btn-outline" onClick={disconnectWallet}>
                Disconnect
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              onClick={connectWallet}
              disabled={connecting}
            >
              {connecting ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>
      </header>

      <main className="main">
        {/* ── Contract Info ── */}
        <div className="info-bar">
          <span className="label">Contract</span>
          <span className="mono">{CONTRACT_ADDRESS}</span>
          <span className="network-badge">Polygon Mainnet</span>
        </div>

        {/* ── Role Viewer ── */}
        <section className="section">
          <h2 className="section-title">Role Members</h2>
          <div className="cards-row">
            {/* Default Admins Card */}
            <div className="card">
              <div className="card-header">
                <div className="card-icon-wrap">👑</div>
                <div>
                  <h3 className="card-title">Default Admins</h3>
                  <p className="card-sub mono-small">DEFAULT_ADMIN_ROLE</p>
                </div>
              </div>
              <button
                className="btn btn-primary w-full"
                onClick={() => loadRole("DEFAULT_ADMIN_ROLE", setDefaultAdmins)}
                disabled={loadingRole === "DEFAULT_ADMIN_ROLE"}
              >
                {loadingRole === "DEFAULT_ADMIN_ROLE"
                  ? "Loading..."
                  : "Show Default Admins"}
              </button>
              {defaultAdmins !== null && (
                <div className="addr-list">
                  {defaultAdmins.length === 0 ? (
                    <p className="empty-msg">No holders found.</p>
                  ) : (
                    defaultAdmins.map((a) => (
                      <div key={a} className="addr-item mono-small" title={a}>
                        {a}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Admins Card */}
            <div className="card">
              <div className="card-header">
                <div className="card-icon-wrap">🛡️</div>
                <div>
                  <h3 className="card-title">Admins</h3>
                  <p className="card-sub mono-small">ADMIN_ROLE</p>
                </div>
              </div>
              <button
                className="btn btn-primary w-full"
                onClick={() => loadRole("ADMIN_ROLE", setAdmins)}
                disabled={loadingRole === "ADMIN_ROLE"}
              >
                {loadingRole === "ADMIN_ROLE" ? "Loading..." : "Show Admins"}
              </button>
              {admins !== null && (
                <div className="addr-list">
                  {admins.length === 0 ? (
                    <p className="empty-msg">No holders found.</p>
                  ) : (
                    admins.map((a) => (
                      <div key={a} className="addr-item mono-small" title={a}>
                        {a}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Access Control Actions ── */}
        <section className="section">
          <h2 className="section-title">Access Control</h2>
          <div className="cards-row">
            {/* Grant Role */}
            <div className="card card-action">
              <div className="card-header">
                <div className="card-icon-wrap">➕</div>
                <div>
                  <h3 className="card-title">Grant Role</h3>
                  <p className="card-sub">Assign a role to an address</p>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select
                  className="form-select"
                  value={grantRole}
                  onChange={(e) => setGrantRole(e.target.value)}
                >
                  {Object.keys(ROLES).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <input
                  className="form-input"
                  placeholder="0x..."
                  value={grantAddress}
                  onChange={(e) => setGrantAddress(e.target.value)}
                />
              </div>
              <button
                className="btn btn-success w-full"
                disabled={txStatus.grant?.loading}
                onClick={() =>
                  sendTx("grant", (c) =>
                    c.grantRole(ROLES[grantRole], grantAddress)
                  )
                }
              >
                {txStatus.grant?.loading ? "Sending..." : "Grant Role"}
              </button>
              {txStatus.grant?.msg && (
                <p className={`tx-msg ${txStatus.grant.msg.startsWith("Error") ? "tx-err" : "tx-ok"}`}>
                  {txStatus.grant.msg}
                </p>
              )}
            </div>

            {/* Revoke Role */}
            <div className="card card-action">
              <div className="card-header">
                <div className="card-icon-wrap">❌</div>
                <div>
                  <h3 className="card-title">Revoke Role</h3>
                  <p className="card-sub">Remove a role from an address</p>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select
                  className="form-select"
                  value={revokeRole}
                  onChange={(e) => setRevokeRole(e.target.value)}
                >
                  {Object.keys(ROLES).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <input
                  className="form-input"
                  placeholder="0x..."
                  value={revokeAddress}
                  onChange={(e) => setRevokeAddress(e.target.value)}
                />
              </div>
              <button
                className="btn btn-danger w-full"
                disabled={txStatus.revoke?.loading}
                onClick={() =>
                  sendTx("revoke", (c) =>
                    c.revokeRole(ROLES[revokeRole], revokeAddress)
                  )
                }
              >
                {txStatus.revoke?.loading ? "Sending..." : "Revoke Role"}
              </button>
              {txStatus.revoke?.msg && (
                <p className={`tx-msg ${txStatus.revoke.msg.startsWith("Error") ? "tx-err" : "tx-ok"}`}>
                  {txStatus.revoke.msg}
                </p>
              )}
            </div>

            {/* Renounce Role */}
            <div className="card card-action">
              <div className="card-header">
                <div className="card-icon-wrap">🚪</div>
                <div>
                  <h3 className="card-title">Renounce Role</h3>
                  <p className="card-sub">Give up your own role (connected wallet)</p>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select
                  className="form-select"
                  value={renounceRole}
                  onChange={(e) => setRenounceRole(e.target.value)}
                >
                  {Object.keys(ROLES).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              {wallet && (
                <div className="form-group">
                  <label className="form-label">Caller (you)</label>
                  <div className="form-static mono-small">{wallet.address}</div>
                </div>
              )}
              <button
                className="btn btn-warning w-full"
                disabled={txStatus.renounce?.loading || !wallet}
                onClick={() =>
                  sendTx("renounce", (c) =>
                    c.renounceRole(ROLES[renounceRole], wallet.address)
                  )
                }
              >
                {txStatus.renounce?.loading ? "Sending..." : "Renounce Role"}
              </button>
              {txStatus.renounce?.msg && (
                <p className={`tx-msg ${txStatus.renounce.msg.startsWith("Error") ? "tx-err" : "tx-ok"}`}>
                  {txStatus.renounce.msg}
                </p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
