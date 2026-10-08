import { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  auth, provider, signInWithPopup, db,
  collection, doc, addDoc, setDoc, onSnapshot,
  query, orderBy, where, serverTimestamp,
} from './firebase.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomMessages, setRoomMessages] = useState([]);
  const [input, setInput] = useState('');
  const [pmInput, setPmInput] = useState({});
  const [privateChats, setPrivateChats] = useState({});
  const [activePm, setActivePm] = useState(null);
  const messagesEnd = useRef(null);

  const logout = useCallback(() => {
    if (user) {
      setDoc(doc(db, 'users', user.uid), { online: false, lastSeen: serverTimestamp() }, { merge: true });
    }
    signOut(auth);
  }, [user]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setDoc(doc(db, 'users', firebaseUser.uid), {
          username: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          online: true,
          lastSeen: serverTimestamp(),
        }, { merge: true });
      }
      setLoading(false);
    });

    const handleBeforeUnload = () => {
      if (auth.currentUser) {
        setDoc(doc(db, 'users', auth.currentUser.uid), { online: false }, { merge: true });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsub();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users'), where('online', '==', true));
    const unsub = onSnapshot(q, (snap) => {
      const users = [];
      snap.forEach((d) => users.push({ id: d.id, ...d.data() }));
      setOnlineUsers(users);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'rooms'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setRooms(list);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!currentRoom) { setRoomMessages([]); return; }
    const q = query(collection(db, 'rooms', currentRoom, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const msgs = [];
      snap.forEach((d) => msgs.push({ id: d.id, ...d.data() }));
      setRoomMessages(msgs);
    });
    return unsub;
  }, [currentRoom]);

  useEffect(() => {
    if (!activePm || !user) return;
    const q = query(collection(db, 'chats', activePm, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const msgs = [];
      snap.forEach((d) => msgs.push({ id: d.id, ...d.data() }));
      setPrivateChats((prev) => ({ ...prev, [activePm]: msgs }));
    });
    return unsub;
  }, [activePm, user]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roomMessages, privateChats]);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      alert(err.message);
    }
  };

  const createRoom = async () => {
    const name = prompt('Room name:');
    if (!name) return;
    await addDoc(collection(db, 'rooms'), {
      name,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    });
  };

  const joinRoom = (roomId) => {
    setCurrentRoom(roomId);
    setActivePm(null);
  };

  const sendRoomMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !currentRoom) return;
    await addDoc(collection(db, 'rooms', currentRoom, 'messages'), {
      text: input.trim(),
      user: user.displayName,
      uid: user.uid,
      timestamp: serverTimestamp(),
    });
    setInput('');
  };

  const startPrivateChat = (chatUser) => {
    const chatId = [user.uid, chatUser.id || chatUser.uid].sort().join('-');
    setActivePm(chatId);
    setCurrentRoom(null);
  };

  const sendPrivateMessage = async (e, toId) => {
    e.preventDefault();
    const text = pmInput[activePm]?.trim();
    if (!text) return;
    const chatId = activePm;
    if (!chatId) return;
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      text,
      from: user.displayName,
      fromId: user.uid,
      timestamp: serverTimestamp(),
    });
    setPmInput((prev) => ({ ...prev, [chatId]: '' }));
  };

  const currentRoomData = rooms.find((r) => r.id === currentRoom);
  const unread = {};

  if (loading) {
    return <div className="login-screen"><div className="login-card"><p>Loading...</p></div></div>;
  }

  if (!user) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>TextMe</h1>
          <p>Sign in to start chatting</p>
          <button onClick={handleGoogleSignIn} className="google-btn">
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-section">
          <div className="user-info">
            <img src={user.photoURL} alt="" className="avatar" />
            <span>{user.displayName}</span>
            <button className="small-btn" onClick={logout}>Logout</button>
          </div>
        </div>
        <div className="sidebar-section">
          <h2>Rooms <button className="small-btn" onClick={createRoom}>+</button></h2>
          <ul>
            {rooms.map((r) => (
              <li
                key={r.id}
                className={currentRoom === r.id ? 'active' : ''}
                onClick={() => joinRoom(r.id)}
              >
                # {r.name}
              </li>
            ))}
          </ul>
        </div>
        <div className="sidebar-section">
          <h2>Online ({onlineUsers.length})</h2>
          <ul>
            {onlineUsers
              .filter((u) => u.id !== user.uid)
              .map((u) => (
                <li key={u.id} onClick={() => startPrivateChat(u)} className="online-user">
                  ● {u.username}
                </li>
              ))}
          </ul>
        </div>
      </aside>

      <main className="main">
        {currentRoom ? (
          <div className="chat-view">
            <div className="chat-header"># {currentRoomData?.name}</div>
            <div className="messages">
              {roomMessages.map((m) => {
                if (m.user === 'System') {
                  return <div key={m.id} className="message system">{m.text}</div>;
                }
                return (
                  <div key={m.id} className={`message ${m.uid === user.uid ? 'own' : ''}`}>
                    <strong>{m.user}</strong> {m.text}
                  </div>
                );
              })}
              <div ref={messagesEnd} />
            </div>
            <form className="input-bar" onSubmit={sendRoomMessage}>
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message..." />
              <button type="submit">Send</button>
            </form>
          </div>
        ) : activePm ? (
          <div className="chat-view">
            <div className="chat-header">
              PM with {privateChats[activePm]?.find((m) => m.fromId !== user.uid)?.from || 'User'}
              <button className="small-btn" onClick={() => setActivePm(null)}>Back</button>
            </div>
            <div className="messages">
              {(privateChats[activePm] || []).map((m) => (
                <div key={m.id} className={`message ${m.fromId === user.uid ? 'own' : ''}`}>
                  <strong>{m.from}</strong> {m.text}
                </div>
              ))}
              <div ref={messagesEnd} />
            </div>
            <form className="input-bar" onSubmit={(e) => sendPrivateMessage(e, activePm)}>
              <input
                value={pmInput[activePm] || ''}
                onChange={(e) => setPmInput((prev) => ({ ...prev, [activePm]: e.target.value }))}
                placeholder="Type a private message..."
              />
              <button type="submit">Send</button>
            </form>
          </div>
        ) : (
          <div className="placeholder">
            <h2>Welcome, {user.displayName}!</h2>
            <p>Join a room or click on an online user to start chatting.</p>
          </div>
        )}
      </main>
    </div>
  );
}
