import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_RATING = 1200;
const K_FACTOR = 32;
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

const defaultPlayers = [
  { id: uuidv4(), name: 'Rift Ranger', rating: DEFAULT_RATING, games: 0, wins: 0, losses: 0 },
  { id: uuidv4(), name: 'Arcane Aegis', rating: DEFAULT_RATING, games: 0, wins: 0, losses: 0 }
];

const emptyLobby = { hostId: '', code: '', mode: 'Standard', notes: '' };

function decodeJwt(credential) {
  try {
    const payloadSegment = credential.split('.')[1];
    const payload = JSON.parse(atob(payloadSegment.replace(/-/g, '+').replace(/_/g, '/')));

    return {
      id: payload.sub,
      name: payload.name || payload.email || 'Google user',
      email: payload.email,
      picture: payload.picture
    };
  } catch (error) {
    console.error('Failed to decode Google credential', error);
    return null;
  }
}

function calculateEloDelta(winnerRating, loserRating) {
  const expectedWin = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLose = 1 - expectedWin;

  const winnerDelta = K_FACTOR * (1 - expectedWin);
  const loserDelta = K_FACTOR * (0 - expectedLose);

  return { winnerDelta, loserDelta };
}

const formatDate = (value) => new Date(value).toLocaleString();

function RatingDelta({ value }) {
  const prefix = value > 0 ? '+' : '';
  return <span className={value >= 0 ? 'pill pill-positive' : 'pill pill-negative'}>{`${prefix}${value}`}</span>;
}

function LobbyRow({ lobby, players, onJoin, onReport }) {
  const host = players.find((p) => p.id === lobby.hostId);
  const opponent = players.find((p) => p.id === lobby.opponentId);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Lobby code</p>
          <p className="code">{lobby.code}</p>
        </div>
        <div className="status-pill">{lobby.status}</div>
      </div>
      <div className="card-body">
        <p><strong>Mode:</strong> {lobby.mode}</p>
        <p><strong>Host:</strong> {host?.name ?? 'Unknown'}</p>
        {opponent && <p><strong>Opponent:</strong> {opponent.name}</p>}
        {lobby.notes && <p className="notes">{lobby.notes}</p>}
        <p className="timestamp">Created {formatDate(lobby.createdAt)}</p>
      </div>
      <div className="card-footer">
        {lobby.status === 'open' && (
          <JoinForm lobby={lobby} players={players} onJoin={onJoin} />
        )}
        {lobby.status === 'matched' && (
          <ReportResultForm lobby={lobby} players={players} onReport={onReport} />
        )}
        {lobby.status === 'completed' && lobby.winnerId && (
          <p className="victory">Winner: {players.find((p) => p.id === lobby.winnerId)?.name}</p>
        )}
      </div>
    </div>
  );
}

function JoinForm({ lobby, players, onJoin }) {
  const [opponentId, setOpponentId] = useState('');
  const availablePlayers = players.filter((p) => p.id !== lobby.hostId);

  return (
    <form
      className="form-inline"
      onSubmit={(e) => {
        e.preventDefault();
        if (!opponentId) return;
        onJoin(lobby.id, opponentId);
        setOpponentId('');
      }}
    >
      <label>
        Join as
        <select value={opponentId} onChange={(e) => setOpponentId(e.target.value)}>
          <option value="">Select player</option>
          {availablePlayers.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="primary">Join lobby</button>
    </form>
  );
}

function ReportResultForm({ lobby, players, onReport }) {
  const [winnerId, setWinnerId] = useState('');
  const participants = players.filter((p) => [lobby.hostId, lobby.opponentId].includes(p.id));

  return (
    <form
      className="form-inline"
      onSubmit={(e) => {
        e.preventDefault();
        if (!winnerId) return;
        onReport(lobby.id, winnerId);
        setWinnerId('');
      }}
    >
      <label>
        Winner
        <select value={winnerId} onChange={(e) => setWinnerId(e.target.value)}>
          <option value="">Pick winner</option>
          {participants.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="primary">Report result</button>
    </form>
  );
}

export default function RankingDashboard() {
  const [players, setPlayers] = useState([]);
  const [lobbies, setLobbies] = useState([]);
  const [matches, setMatches] = useState([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [lobbyDraft, setLobbyDraft] = useState(emptyLobby);
  const [authUser, setAuthUser] = useState(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleError, setGoogleError] = useState('');
  const buttonRef = useRef(null);

  useEffect(() => {
    const storedPlayers = JSON.parse(localStorage.getItem('rift_players') ?? 'null');
    const storedLobbies = JSON.parse(localStorage.getItem('rift_lobbies') ?? 'null');
    const storedMatches = JSON.parse(localStorage.getItem('rift_matches') ?? 'null');

    setPlayers(storedPlayers ?? defaultPlayers);
    setLobbies(storedLobbies ?? []);
    setMatches(storedMatches ?? []);
  }, []);

  useEffect(() => {
    localStorage.setItem('rift_players', JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    localStorage.setItem('rift_lobbies', JSON.stringify(lobbies));
  }, [lobbies]);

  useEffect(() => {
    localStorage.setItem('rift_matches', JSON.stringify(matches));
  }, [matches]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setGoogleError('Add REACT_APP_GOOGLE_CLIENT_ID to enable Google sign-in.');
      return;
    }

    if (document.getElementById('google-identity-script')) {
      setGoogleReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.id = 'google-identity-script';
    script.onload = () => setGoogleReady(true);
    script.onerror = () => setGoogleError('Unable to load Google sign-in right now.');
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!googleReady || !GOOGLE_CLIENT_ID || !buttonRef.current || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        const profile = decodeJwt(response.credential);
        if (profile) setAuthUser(profile);
      }
    });

    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      width: 280
    });

    window.google.accounts.id.prompt();
  }, [googleReady]);

  useEffect(() => {
    if (!authUser) return;

    setPlayers((prev) => {
      const exists = prev.some((player) => player.id === authUser.id);
      if (exists) return prev;

      return [
        {
          id: authUser.id,
          name: authUser.name,
          rating: DEFAULT_RATING,
          games: 0,
          wins: 0,
          losses: 0,
          email: authUser.email,
          picture: authUser.picture
        },
        ...prev
      ];
    });

    setLobbyDraft((draft) => ({
      ...draft,
      hostId: authUser.id
    }));
  }, [authUser]);

  const leaderboard = useMemo(
    () => [...players].sort((a, b) => b.rating - a.rating),
    [players]
  );

  const openLobbies = lobbies.filter((lobby) => lobby.status !== 'completed');

  function addPlayer(e) {
    e.preventDefault();
    if (!newPlayerName.trim()) return;

    const newPlayer = {
      id: uuidv4(),
      name: newPlayerName.trim(),
      rating: DEFAULT_RATING,
      games: 0,
      wins: 0,
      losses: 0
    };

    setPlayers((prev) => [...prev, newPlayer]);
    setNewPlayerName('');
  }

  function createLobby(e) {
    e.preventDefault();
    const { hostId, code, mode, notes } = lobbyDraft;
    if (!hostId || !code.trim()) return;

    const newLobby = {
      id: uuidv4(),
      hostId,
      code: code.trim(),
      mode: mode || 'Standard',
      notes: notes.trim(),
      status: 'open',
      createdAt: new Date().toISOString()
    };

    setLobbies((prev) => [newLobby, ...prev]);
    setLobbyDraft(emptyLobby);
  }

  function joinLobby(lobbyId, opponentId) {
    setLobbies((prev) =>
      prev.map((lobby) =>
        lobby.id === lobbyId
          ? { ...lobby, opponentId, status: 'matched' }
          : lobby
      )
    );
  }

  function reportResult(lobbyId, winnerId) {
    setLobbies((prevLobbies) => {
      const lobby = prevLobbies.find((item) => item.id === lobbyId);
      if (!lobby || !lobby.opponentId) return prevLobbies;

      const loserId = lobby.hostId === winnerId ? lobby.opponentId : lobby.hostId;
      const winner = players.find((p) => p.id === winnerId);
      const loser = players.find((p) => p.id === loserId);

      if (!winner || !loser) return prevLobbies;

      const { winnerDelta, loserDelta } = calculateEloDelta(winner.rating, loser.rating);

      setPlayers((prevPlayers) =>
        prevPlayers.map((player) => {
          if (player.id === winnerId) {
            return {
              ...player,
              rating: Math.round(player.rating + winnerDelta),
              games: player.games + 1,
              wins: player.wins + 1
            };
          }
          if (player.id === loserId) {
            return {
              ...player,
              rating: Math.round(player.rating + loserDelta),
              games: player.games + 1,
              losses: player.losses + 1
            };
          }
          return player;
        })
      );

      const completedLobby = {
        ...lobby,
        status: 'completed',
        winnerId,
        finishedAt: new Date().toISOString(),
        ratingChange: Math.round(winnerDelta)
      };

      setMatches((prev) => [
        {
          id: uuidv4(),
          lobbyId,
          winnerId,
          loserId,
          createdAt: completedLobby.finishedAt,
          ratingChange: Math.round(winnerDelta)
        },
        ...prev
      ]);

      return prevLobbies.map((item) => (item.id === lobbyId ? completedLobby : item));
    });
  }

  function signOut() {
    if (authUser && window.google?.accounts.id) {
      window.google.accounts.id.revoke(authUser.email ?? '', () => {});
    }
    setAuthUser(null);
    setLobbyDraft(emptyLobby);
  }

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-content">
          <div>
            <p className="eyebrow">Riftbound arena ladder</p>
            <h1>Host lobbies, match quickly, and track Elo without leaving TCG Arena</h1>
            <p className="lede">
              Sign in with Google, post lobby codes, invite opponents, and keep a living rating history for your
              community.
            </p>
            <div className="pill-row">
              <span className="pill pill-soft">Google sign-in ready</span>
              <span className="pill pill-soft">Manual match reporting</span>
              <span className="pill pill-soft">Instant Elo updates</span>
            </div>
          </div>
          <div className="hero-panel">
            <div className="session-card">
              <div className="session-header">
                <span className="eyebrow">Account</span>
                {authUser ? <span className="status-pill success">Signed in</span> : <span className="status-pill">Guest</span>}
              </div>
              {authUser ? (
                <div className="session-body">
                  <div className="session-profile">
                    {authUser.picture ? <img src={authUser.picture} alt={authUser.name} /> : <div className="avatar-placeholder">{authUser.name[0]}</div>}
                    <div>
                      <p className="name">{authUser.name}</p>
                      <p className="muted">{authUser.email ?? 'Google account'}</p>
                    </div>
                  </div>
                  <p className="muted">Your profile is added to the ladder automatically when you sign in.</p>
                  <button type="button" className="ghost" onClick={signOut}>Sign out</button>
                </div>
              ) : (
                <div className="session-body">
                  <p className="muted">Connect your Google account to post lobbies and claim your rating.</p>
                  <div ref={buttonRef} className="google-button-slot" aria-live="polite" />
                  {googleError && <p className="alert">{googleError}</p>}
                  <p className="helper">We never store your Google credential—just your public name and email.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="grid enhanced-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Players</p>
              <h2>Leaderboard & quick add</h2>
              <p className="muted">Add teammates manually or sign in with Google to reserve your slot.</p>
            </div>
            <form className="form-inline" onSubmit={addPlayer}>
              <label>
                Display name
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="New contender"
                />
              </label>
              <button type="submit" className="primary">Add player</button>
            </form>
          </div>
          <div className="table leaderboard">
            <div className="table-row table-head five-col">
              <span>#</span>
              <span>Player</span>
              <span>Rating</span>
              <span>W / L</span>
              <span>Games</span>
            </div>
            {leaderboard.map((player, index) => (
              <div key={player.id} className="table-row five-col">
                <span>{index + 1}</span>
                <span className="player-cell">
                  {player.picture && <img src={player.picture} alt={player.name} className="avatar tiny" />}
                  {player.name}
                </span>
                <span>{player.rating}</span>
                <span>
                  {player.wins} / {player.losses}
                </span>
                <span>{player.games}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Matchmaking</p>
              <h2>Post a lobby code</h2>
              <p className="muted">Share your TCG Arena lobby and let challengers join in seconds.</p>
            </div>
            <form className="form-grid" onSubmit={createLobby}>
              <label>
                Host
                <select
                  value={lobbyDraft.hostId}
                  onChange={(e) => setLobbyDraft({ ...lobbyDraft, hostId: e.target.value })}
                >
                  <option value="">Select host</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Lobby code
                <input
                  value={lobbyDraft.code}
                  onChange={(e) => setLobbyDraft({ ...lobbyDraft, code: e.target.value })}
                  placeholder="e.g. ABC-123"
                />
              </label>
              <label>
                Mode
                <select
                  value={lobbyDraft.mode}
                  onChange={(e) => setLobbyDraft({ ...lobbyDraft, mode: e.target.value })}
                >
                  <option>Standard</option>
                  <option>Draft</option>
                  <option>Best-of-3</option>
                  <option>Friendly</option>
                </select>
              </label>
              <label>
                Notes
                <input
                  value={lobbyDraft.notes}
                  onChange={(e) => setLobbyDraft({ ...lobbyDraft, notes: e.target.value })}
                  placeholder="Region, time window, expectations"
                />
              </label>
              <button type="submit" className="primary">Publish lobby</button>
            </form>
          </div>
          {openLobbies.length === 0 && <p className="empty">No active lobbies yet—be the first to post!</p>}
          <div className="lobby-grid">
            {openLobbies.map((lobby) => (
              <LobbyRow key={lobby.id} lobby={lobby} players={players} onJoin={joinLobby} onReport={reportResult} />
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Recent matches</p>
              <h2>History & rating changes</h2>
              <p className="muted">See who climbed the ladder and how much their Elo moved.</p>
            </div>
          </div>
          {matches.length === 0 && <p className="empty">No matches reported yet.</p>}
          <div className="table">
            <div className="table-row table-head four-col">
              <span>Date</span>
              <span>Winner</span>
              <span>Loser</span>
              <span>Δ Elo</span>
            </div>
            {matches.map((match) => {
              const winner = players.find((p) => p.id === match.winnerId);
              const loser = players.find((p) => p.id === match.loserId);
              return (
                <div key={match.id} className="table-row four-col">
                  <span>{formatDate(match.createdAt)}</span>
                  <span className="player-cell">{winner?.picture && <img src={winner.picture} alt={winner.name} className="avatar tiny" />} {winner?.name ?? 'Unknown'}</span>
                  <span className="player-cell">{loser?.picture && <img src={loser.picture} alt={loser.name} className="avatar tiny" />} {loser?.name ?? 'Unknown'}</span>
                  <span>
                    <RatingDelta value={match.ratingChange} />
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
