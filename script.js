import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, getDocs, deleteDoc, updateDoc, query, orderBy, limit, increment, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 1. CONFIGURAZIONE FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyCnac92fjhqj7Hq2BVFL86KSwwjCvxsZYY",
  authDomain: "conquiste-horde.firebaseapp.com",
  projectId: "conquiste-horde",
  storageBucket: "conquiste-horde.firebasestorage.app",
  messagingSenderId: "323624294367",
  appId: "1:323624294367:web:848ef538fae4f74be6966a",
  measurementId: "G-8GZPN15VH4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- SISTEMA UI CUSTOM (TOAST E MODAL) ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

let confirmAction = null;
function showConfirmModal(title, message, onConfirm) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-message').innerText = message;
    confirmAction = onConfirm;
    document.getElementById('custom-modal-overlay').style.display = 'flex';
}

document.getElementById('modal-btn-cancel').addEventListener('click', () => {
    document.getElementById('custom-modal-overlay').style.display = 'none';
    confirmAction = null;
});

document.getElementById('modal-btn-confirm').addEventListener('click', () => {
    document.getElementById('custom-modal-overlay').style.display = 'none';
    if (confirmAction) confirmAction();
    confirmAction = null;
});

// --- SISTEMA LOG OPERATIVO ---
async function logActivity(message) {
    if (!currentUser && !auth.currentUser) return;
    const utente = currentUser ? currentUser.nome : (auth.currentUser?.email || "Sconosciuto");
    try {
        await addDoc(collection(db, "activity_log"), {
            testo: message,
            utente: utente,
            timestamp: new Date()
        });
    } catch (e) { console.error("Errore log:", e); }
}

let activityLogCache = [];

function renderAdminActivityLog(filter = "") {
    const adminBox = document.getElementById('admin-activity-log');
    if (!adminBox) return;
    const f = (filter || "").toLowerCase();
    const filtered = activityLogCache.filter(item => {
        if (!f) return true;
        return (item.testo || "").toLowerCase().includes(f) || (item.utente || "").toLowerCase().includes(f);
    });
    if (filtered.length === 0) {
        adminBox.innerHTML = '<p style="font-size:0.8rem; color:var(--text-secondary); text-align:center;">Nessun movimento trovato.</p>';
        return;
    }
    adminBox.innerHTML = filtered.map(item => {
        const date = item.timestamp ? item.timestamp.toDate() : new Date();
        const timeString = date.toLocaleDateString('it-IT') + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        return `
            <div class="log-item">
                <span class="log-time">[${timeString}] · ${item.utente || '—'}</span>
                <div style="margin-top:4px;">${item.testo}</div>
            </div>
        `;
    }).join('');
}

function avviaAscoltoLog() {
    const q = query(collection(db, "activity_log"), orderBy("timestamp", "desc"), limit(100));
    onSnapshot(q, (snapshot) => {
        activityLogCache = [];
        snapshot.forEach((docSnap) => {
            activityLogCache.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Log laterale Territori
        const box = document.getElementById('activity-log-content');
        if (box) {
            box.innerHTML = '';
            activityLogCache.slice(0, 50).forEach((data) => {
                const date = data.timestamp ? data.timestamp.toDate() : new Date();
                const timeString = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                box.innerHTML += `
                    <div class="log-item">
                        <span class="log-time">[${timeString}]${data.utente ? ' · ' + data.utente : ''}</span><br>
                        ${data.testo}
                    </div>
                `;
            });
        }

        // Log completo in Gestione
        const searchVal = document.getElementById('search-admin-log')?.value || '';
        renderAdminActivityLog(searchVal);
    });
}

// Filtro log in gestione
document.getElementById('search-admin-log')?.addEventListener('input', (e) => {
    renderAdminActivityLog(e.target.value);
});


// --- PROTEZIONE INTERFACCIA ---
document.addEventListener('contextmenu', event => event.preventDefault());

document.onkeydown = function(e) {
    if (e.keyCode == 123) return false; 
    if (e.ctrlKey && e.shiftKey && e.keyCode == 'I'.charCodeAt(0)) return false; 
    if (e.ctrlKey && e.shiftKey && e.keyCode == 'C'.charCodeAt(0)) return false; 
    if (e.ctrlKey && e.shiftKey && e.keyCode == 'J'.charCodeAt(0)) return false; 
    if (e.ctrlKey && e.keyCode == 'U'.charCodeAt(0)) return false; 
};

setInterval(function() {
    debugger;
}, 100);

// UI Login
const loginOverlay = document.getElementById('login-overlay');
const appContainer = document.getElementById('app-container');

// --- AUTH CUSTOM + GESTORE ---
let currentUser = null; // { nome, codice, permessi:[], isAdmin:false }
let listenersStarted = false;
let listaUtenti = [];

const SEZIONI = ['conquiste', 'tattiche', 'piani', 'risorse', 'gestione'];

function applyPermissions() {
    if (!currentUser) return;
    const isAdmin = currentUser.isAdmin;
    const perm = currentUser.permessi || [];

    document.querySelectorAll('.tab-btn').forEach(btn => {
        const target = btn.getAttribute('data-target');
        if (target === 'gestione') {
            btn.style.display = isAdmin ? '' : 'none';
        } else if (target) {
            btn.style.display = (isAdmin || perm.includes(target)) ? '' : 'none';
        }
    });

    // Se la tab attiva non è più visibile, vai alla prima permessa
    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn && activeBtn.style.display === 'none') {
        const first = document.querySelector('.tab-btn:not([style*="display: none"])');
        if (first) first.click();
    }
}

function startAllListeners() {
    if (listenersStarted) return;
    listenersStarted = true;
    avviaAscoltoDati();
    avviaAscoltoTattiche();
    avviaAscoltoChat();
    avviaAscoltoPiani();
    avviaAscoltoLog();
    avviaAscoltoUtenti();
}

// Switch login UI
document.getElementById('link-login-gestore')?.addEventListener('click', () => {
    document.getElementById('login-membro-box').style.display = 'none';
    document.getElementById('login-gestore-box').style.display = 'block';
    document.getElementById('login-admin-password')?.focus();
});
document.getElementById('link-login-membro')?.addEventListener('click', () => {
    document.getElementById('login-gestore-box').style.display = 'none';
    document.getElementById('login-membro-box').style.display = 'block';
    document.getElementById('login-codice')?.focus();
});

// Login membro (codice + password)
document.getElementById('btn-login').addEventListener('click', async () => {
    const codice = (document.getElementById('login-codice')?.value || '').trim();
    const password = (document.getElementById('login-password')?.value || '').trim();
    if (!codice || codice.length !== 4 || !/^\d{4}$/.test(codice)) {
        return showToast("Inserisci un codice a 4 cifre valido.", "error");
    }
    if (!password) return showToast("Inserisci la password.", "error");

    try {
        const q = query(collection(db, "membri"), where("codice", "==", codice));
        const snap = await getDocs(q);
        let found = null;
        snap.forEach(d => {
            const data = d.data();
            if (data.password === password) found = { id: d.id, ...data };
        });
        if (!found) return showToast("Codice o password errati.", "error");

        currentUser = {
            nome: found.nome || found.id,
            codice: found.codice,
            permessi: Array.isArray(found.permessi) ? found.permessi : ['conquiste'],
            isAdmin: false
        };
        loginOverlay.style.display = 'none';
        appContainer.style.display = 'flex';
        startAllListeners();
        applyPermissions();
        showToast(`Benvenuto, ${currentUser.nome}.`, "success");
        logActivity(`🔑 Accesso effettuato.`);
        document.getElementById('login-codice').value = '';
        document.getElementById('login-password').value = '';
    } catch (e) {
        console.error(e);
        showToast("Errore durante l'accesso.", "error");
    }
});

// Login gestore (Firebase Auth)
document.getElementById('btn-login-gestore').addEventListener('click', async () => {
    const password = (document.getElementById('login-admin-password')?.value || '').trim();
    if (!password) return showToast("Inserisci la password gestore.", "error");
    try {
        await signInWithEmailAndPassword(auth, "vampiri.gestore@horde.it", password);
        // onAuthStateChanged gestisce il resto
    } catch (e) {
        showToast("Credenziali Gestore errate.", "error");
    }
});

// Enter key support
document.getElementById('login-password')?.addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('btn-login').click(); });
document.getElementById('login-admin-password')?.addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('btn-login-gestore').click(); });
document.getElementById('login-codice')?.addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('login-password')?.focus(); });

// Firebase Auth solo per gestore
onAuthStateChanged(auth, (user) => {
    if (user && user.email === "vampiri.gestore@horde.it") {
        currentUser = {
            nome: "GESTORE",
            isAdmin: true,
            permessi: SEZIONI
        };
        loginOverlay.style.display = 'none';
        appContainer.style.display = 'flex';
        startAllListeners();
        applyPermissions();
        // Vai a gestione se admin
        const tabG = document.getElementById('tab-gestione');
        if (tabG) { tabG.style.display = ''; tabG.click(); }
        showToast("Accesso Gestore eseguito.", "success");
        logActivity(`🔑 Accesso Gestore effettuato.`);
    } else if (!user && currentUser && currentUser.isAdmin) {
        // logout gestore
        currentUser = null;
        loginOverlay.style.display = 'flex';
        appContainer.style.display = 'none';
    }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    currentUser = null;
    try { await signOut(auth); } catch(e) {}
    loginOverlay.style.display = 'flex';
    appContainer.style.display = 'none';
    // reset login UI
    document.getElementById('login-gestore-box').style.display = 'none';
    document.getElementById('login-membro-box').style.display = 'block';
    showToast("Sessione chiusa.", "info");
});

// --- GESTIONE UTENTI (solo admin) ---
function avviaAscoltoUtenti() {
    onSnapshot(collection(db, "membri"), (snap) => {
        listaUtenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAdminUtenti();
    });
}

function renderAdminUtenti() {
    const tbody = document.getElementById('admin-utenti-body');
    if (!tbody) return;
    tbody.innerHTML = listaUtenti.map(u => {
        const perms = Array.isArray(u.permessi) ? u.permessi.join(', ') : '—';
        return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="padding:8px;"><b>${u.nome || u.id}</b></td>
            <td style="padding:8px; font-family:monospace;">${u.codice || '—'}</td>
            <td style="padding:8px; font-size:0.75rem;">${perms}</td>
            <td style="padding:8px;">
                <button class="btn-status btn-attesa" style="padding:4px 10px; font-size:0.7rem;" data-edit="${u.id}">Modifica</button>
                <button class="btn-status btn-completata" style="padding:4px 10px; font-size:0.7rem; background:#7f1d1d;" data-del="${u.id}">Elimina</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="4" style="padding:15px; text-align:center; opacity:0.5;">Nessun utente</td></tr>';
}

document.getElementById('admin-utenti-body')?.addEventListener('click', async (e) => {
    const editId = e.target.getAttribute('data-edit');
    const delId = e.target.getAttribute('data-del');
    if (editId) {
        const u = listaUtenti.find(x => x.id === editId);
        if (!u) return;
        document.getElementById('admin-user-nome').value = u.nome || u.id;
        document.getElementById('admin-user-grado').value = u.grado || '';
        document.getElementById('admin-user-codice').value = u.codice || '';
        document.getElementById('admin-user-password').value = u.password || '';
        document.querySelectorAll('.perm-check').forEach(cb => {
            cb.checked = Array.isArray(u.permessi) && u.permessi.includes(cb.value);
        });
        showToast("Dati caricati. Modifica e premi Salva.", "info");
    }
    if (delId) {
        showConfirmModal("Elimina utente", "Vuoi eliminare questo utente?", async () => {
            await deleteDoc(doc(db, "membri", delId));
            logActivity(`🗑️ Utente <b>${delId}</b> eliminato.`);
            showToast("Utente eliminato.", "success");
        });
    }
});

document.getElementById('btn-salva-utente')?.addEventListener('click', async () => {
    if (!currentUser?.isAdmin) return showToast("Solo il gestore può creare utenti.", "error");
    const nome = document.getElementById('admin-user-nome').value.trim();
    const grado = document.getElementById('admin-user-grado').value.trim();
    const codice = document.getElementById('admin-user-codice').value.trim();
    const password = document.getElementById('admin-user-password').value.trim();
    if (!nome) return showToast("Nome obbligatorio.", "error");
    if (codice && (codice.length !== 4 || !/^\d{4}$/.test(codice))) {
        return showToast("Il codice deve essere di 4 cifre.", "error");
    }
    const permessi = [];
    document.querySelectorAll('.perm-check:checked').forEach(cb => permessi.push(cb.value));
    if (permessi.length === 0) permessi.push('conquiste');

    // Unicità codice
    if (codice) {
        const q = query(collection(db, "membri"), where("codice", "==", codice));
        const snap = await getDocs(q);
        let conflict = false;
        snap.forEach(d => { if (d.id !== nome) conflict = true; });
        if (conflict) return showToast("Questo codice è già in uso.", "error");
    }

    const data = { nome, grado, permessi };
    if (codice) data.codice = codice;
    if (password) data.password = password;

    await setDoc(doc(db, "membri", nome), data, { merge: true });
    logActivity(`👤 Utente <b>${nome}</b> creato/aggiornato (permessi: ${permessi.join(', ')}).`);
    document.getElementById('admin-user-nome').value = '';
    document.getElementById('admin-user-grado').value = '';
    document.getElementById('admin-user-codice').value = '';
    document.getElementById('admin-user-password').value = '';
    document.querySelectorAll('.perm-check').forEach(cb => {
        cb.checked = ['conquiste','tattiche','piani'].includes(cb.value);
    });
    showToast("Utente salvato.", "success");
});

// DATI FAZIONI
const fazioniDef = [
    { id: "ghoul", name: "Ghoul", color: "#03e903" },
    { id: "rsg", name: "Ghoul RSG", color: "#006400" },
    { id: "lycan", name: "Lycan", color: "#808080" },
    { id: "bloodbound", name: "Bloodbound", color: "#404040" },
    { id: "wulfing", name: "Wulfing", color: "#D3D3D3" },
    { id: "kitzune", name: "Kitzune", color: "#FFA500" },
    { id: "onimaru", name: "Onimaru", color: "#FFFF00" },
    { id: "inugami", name: "Inugami", color: "#DAA520" },
    { id: "vampiri", name: "Vampiri", color: "#ff0000" },
    { id: "noctis", name: "Noctis Aeterna", color: "#8B0000" },
    { id: "demoni", name: "Demoni", color: "#5500ff" },
    { id: "aeterna", name: "Aeterna Mortis", color: "#4B0082" }
];

// Popola select Piani d'azione
const pianoSelect = document.getElementById('piano-fazione');
fazioniDef.forEach(f => {
    pianoSelect.innerHTML += `<option value="${f.name}">${f.name}</option>`;
});

let globalData = { territori: {}, punti: {}, anelli: {} };

// TABS NAVIGAZIONE
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view-area').forEach(v => v.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('view-' + target).classList.add('active');
    });
});

// GENERAZIONE GRIGLIA TERRITORI
const griglia = document.getElementById('griglia');
const righe = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
let fazioneAttiva = null;

for (let i = 0; i < righe.length; i++) {
    for (let j = 1; j <= 11; j++) {
        const cellaId = `${righe[i]}${j}`;
        const div = document.createElement('div');
        div.classList.add('cella'); div.id = cellaId; 
        div.innerHTML = `<div class="cella-id">${cellaId}</div><div class="cella-icons" id="icons_${cellaId}"></div>`;
        div.addEventListener('click', () => conquistaTerritorio(cellaId));
        griglia.appendChild(div);
    }
}

// SELEZIONE CARDS FAZIONI
document.querySelectorAll('.faction-card').forEach(card => {
    card.addEventListener('click', (e) => {
        document.querySelectorAll('.faction-card').forEach(c => c.classList.remove('attiva'));
        card.classList.add('attiva');
        fazioneAttiva = { id: card.dataset.id, colore: card.dataset.color };
    });
});

async function conquistaTerritorio(cellaId) {
    if (!fazioneAttiva) { showToast("Seleziona una fazione prima di cliccare!", "error"); return; }
    if (!currentUser && !auth.currentUser) return;
    
    const oldOwnerId = globalData.territori[cellaId];
    if (oldOwnerId === fazioneAttiva.id) return; // Stessa fazione, nessun cambiamento

    try {
        // Aggiorna Territorio
        await setDoc(doc(db, "territori", cellaId), {
            owner: fazioneAttiva.id, color: fazioneAttiva.colore, timestamp: new Date()
        });

        // Auto-deduzione anello (solo se la fazione non è Nessuno)
        if (fazioneAttiva.id !== 'nessuno') {
            await setDoc(doc(db, "sistema", "anelli"), {
                [fazioneAttiva.id]: increment(-1)
            }, { merge: true });
        }

        // Costruzione Log Conquista
        const nomeNuova = fazioneAttiva.id === 'nessuno' ? 'Territorio Reso Neutrale' : (fazioniDef.find(f => f.id === fazioneAttiva.id)?.name || fazioneAttiva.id);
        let msgLog = '';

        if (fazioneAttiva.id === 'nessuno') {
            msgLog = `🏳️ Il quadrante <b>${cellaId}</b> è tornato neutrale.`;
        } else {
            msgLog = `🗺️ <b>${nomeNuova}</b> ha conquistato il quadrante <b>${cellaId}</b>`;
            if (oldOwnerId && oldOwnerId !== 'nessuno') {
                const nomeVecchia = fazioniDef.find(f => f.id === oldOwnerId)?.name || oldOwnerId;
                msgLog += ` (sottraendolo a ${nomeVecchia})`;
            }

            // Cerca risorse in quel quadrante
            let risorseTrovate = [];
            for (const pId in globalData.punti) {
                const p = globalData.punti[pId];
                if (p.quadrante && p.quadrante.toUpperCase().trim() === cellaId) {
                    risorseTrovate.push(p.nome);
                }
            }
            if (risorseTrovate.length > 0) {
                msgLog += `, ottenendo: <i>${risorseTrovate.join(', ')}</i>`;
            }
        }

        logActivity(msgLog + ".");

    } catch (e) { console.error(e); }
}

// ASCOLTO DATI DA FIREBASE
function avviaAscoltoDati() {
    // Ascolto territori
    document.querySelectorAll('.cella').forEach(cella => {
        onSnapshot(doc(db, "territori", cella.id), (docSnap) => {
            if (docSnap.exists()) {
                const dati = docSnap.data();
                cella.style.backgroundColor = dati.color;
                globalData.territori[cella.id] = dati.owner;
            } else {
                cella.style.backgroundColor = 'transparent';
                globalData.territori[cella.id] = 'nessuno';
            }
            ricalcolaDati();
        });
    });

    // Ascolto punti interesse
    onSnapshot(collection(db, "punti_interesse"), (snapshot) => {
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            globalData.punti[docSnap.id] = data;
            const inp = document.getElementById(`quad_${docSnap.id}`);
            if (inp) inp.value = data.quadrante || "";
        });
        ricalcolaDati();
    });

    // Ascolto Anelli
    onSnapshot(doc(db, "sistema", "anelli"), (docSnap) => {
        if (docSnap.exists()) {
            globalData.anelli = docSnap.data();
            // Aggiorna gli input nella vista Database
            fazioniDef.forEach(f => {
                if (f.id !== 'nessuno') {
                    const inp = document.getElementById(`anelli_${f.id}`);
                    if (inp) inp.value = globalData.anelli[f.id] || 0;
                }
            });
        } else {
            globalData.anelli = {};
        }
        ricalcolaDati();
    });
}

// MOTORE: AGGIORNA MAPPA, LEGENDA E CLASSIFICA (CON NUOVO PUNTEGGIO)
function ricalcolaDati() {
    document.querySelectorAll('.cella-icons').forEach(c => c.innerHTML = ''); 
    for (const pId in globalData.punti) {
        const p = globalData.punti[pId];
        if (p.quadrante && p.quadrante.trim() !== '') {
            const q = p.quadrante.toUpperCase().trim();
            const iconContainer = document.getElementById(`icons_${q}`);
            if (iconContainer) {
                const icon = p.type === 'mat' ? '⛏️' : (p.type === 'mer' ? '💰' : '🔮');
                iconContainer.innerHTML += `<span>${icon}</span>`;
            }
        }
    }

    const stats = {};
    fazioniDef.forEach(f => { 
        stats[f.id] = { 
            nome: f.name, colore: f.color, 
            terr: 0, mat: 0, mer: 0, alt: 0,
            anelli: globalData.anelli[f.id] || 0,
            matNames: [], merNames: [], altNames: [],
            punteggio: 0
        }; 
    });
    stats["nessuno"] = { nome: "Neutrale", colore: "#334155", terr: 0, mat: 0, mer: 0, alt: 0, anelli: 0, matNames: [], merNames: [], altNames: [], punteggio: 0 };

    for (const cella in globalData.territori) { 
        const owner = globalData.territori[cella];
        if (stats[owner]) stats[owner].terr++; 
    }
    
    for (const pId in globalData.punti) {
        const p = globalData.punti[pId];
        if (p.quadrante && p.quadrante.trim() !== '') {
            const q = p.quadrante.toUpperCase().trim();
            const ownerDelQuadrante = globalData.territori[q];
            
            if (ownerDelQuadrante && ownerDelQuadrante !== 'nessuno' && stats[ownerDelQuadrante]) {
                if (p.type === 'mat') { stats[ownerDelQuadrante].mat++; stats[ownerDelQuadrante].matNames.push(p.nome); }
                if (p.type === 'mer') { stats[ownerDelQuadrante].mer++; stats[ownerDelQuadrante].merNames.push(p.nome); }
                if (p.type === 'alt') { stats[ownerDelQuadrante].alt++; stats[ownerDelQuadrante].altNames.push(p.nome); }
            }
        }
    }

    let classifica = [];
    for (const fId in stats) {
        if (fId !== 'nessuno' && (stats[fId].terr > 0 || stats[fId].mat > 0 || stats[fId].mer > 0 || stats[fId].alt > 0 || stats[fId].anelli > 0)) {
            // Punteggio: base 1, con mercante 2 (+1), con materiale 3 (+2), con altare 4 (+3)
            stats[fId].punteggio = (stats[fId].terr * 1) + (stats[fId].mer * 1) + (stats[fId].mat * 2) + (stats[fId].alt * 3);
            classifica.push(stats[fId]);
        }
    }

    // Ordina per Punteggio decrescente, a parità per numero territori
    classifica.sort((a, b) => b.punteggio - a.punteggio || b.terr - a.terr);

    const cont = document.getElementById('stats-content');
    cont.innerHTML = '';

    let conquistati = classifica.reduce((sum, f) => sum + f.terr, 0);
    let liberi = 121 - conquistati;

    cont.innerHTML += `
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; border: 1px dashed var(--glass-border); box-shadow: inset 0 0 10px rgba(0,0,0,0.5);">
            <span style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; font-weight: bold;">Territori Liberi</span><br>
            <span style="font-family: 'Rajdhani'; font-size: 2.2rem; color: #fff; text-shadow: 0 0 15px rgba(255,255,255,0.6);">${liberi}</span> 
            <span style="color: var(--text-secondary); font-size: 1rem;">/ 121</span>
        </div>
    `;

    if (classifica.length === 0) {
        cont.innerHTML += '<p style="font-size:0.8rem; color:var(--text-secondary); text-align:center;">Nessun dominio stabilito.</p>';
        return;
    }

    classifica.forEach((s, index) => {
        let medaglia = '';
        if (index === 0) medaglia = '<span style="font-size: 1.2rem; text-shadow: 0 0 5px gold;">🥇</span>';
        else if (index === 1) medaglia = '<span style="font-size: 1.2rem; text-shadow: 0 0 5px silver;">🥈</span>';
        else if (index === 2) medaglia = '<span style="font-size: 1.2rem; text-shadow: 0 0 5px #cd7f32;">🥉</span>';
        else medaglia = `<span style="font-size: 0.9rem; color: var(--text-secondary); width: 22px; display: inline-block; text-align: center; font-family: 'Rajdhani';">${index + 1}°</span>`;

        let dettagli = '';
        if (s.matNames.length > 0) dettagli += `<div class="stat-details"><b>⛏️ Materiali:</b> ${s.matNames.join(', ')}</div>`;
        if (s.merNames.length > 0) dettagli += `<div class="stat-details"><b>💰 Mercanti:</b> ${s.merNames.join(', ')}</div>`;
        if (s.altNames.length > 0) dettagli += `<div class="stat-details"><b>🔮 Altari:</b> ${s.altNames.join(', ')}</div>`;

        cont.innerHTML += `
        <div class="stat-row">
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                <div class="stat-faction-name" style="color: ${s.colore}; display: flex; align-items: center; gap: 8px;">
                    ${medaglia} ${s.nome}
                </div>
                <div class="stat-values">
                    <span title="Punti Dominio">🏆 <b>${s.punteggio}</b></span>
                    <span title="Anelli">💍 <b>${s.anelli}</b></span>
                    <span title="Quadranti">🗺️ <b>${s.terr}</b></span>
                    <span title="Aree Raccolta">⛏️ ${s.mat}</span>
                    <span title="Mercanti">💰 ${s.mer}</span>
                    <span title="Altari">🔮 ${s.alt}</span>
                </div>
            </div>
            ${dettagli}
        </div>`;
    });
}

// TATTICHE CONDIVISE (DISEGNO)
const canvas = document.getElementById('tattiche-canvas');
const ctx = canvas.getContext('2d');
canvas.width = 900; canvas.height = 900;
let disegnando = false;
let currentPath = [];

function getMousePos(evt) { const rect = canvas.getBoundingClientRect(); return { x: evt.clientX - rect.left, y: evt.clientY - rect.top }; }

canvas.addEventListener('mousedown', (e) => {
    disegnando = true; const pos = getMousePos(e); currentPath = [{ x: pos.x, y: pos.y }];
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
});

canvas.addEventListener('mousemove', (e) => {
    if (!disegnando) return;
    const pos = getMousePos(e); currentPath.push({ x: pos.x, y: pos.y });
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = document.getElementById('colore-tratto').value;
    ctx.lineWidth = document.getElementById('spessore-tratto').value;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
});

canvas.addEventListener('mouseup', async () => {
    if (!disegnando) return;
    disegnando = false;
    try {
        await addDoc(collection(db, "tattiche_condivise"), {
            path: currentPath, color: document.getElementById('colore-tratto').value, width: document.getElementById('spessore-tratto').value, timestamp: new Date()
        });
    } catch (e) { console.error(e); }
});

document.getElementById('spessore-tratto').addEventListener('input', (e) => document.getElementById('spessore-val').innerText = e.target.value);

function avviaAscoltoTattiche() {
    onSnapshot(collection(db, "tattiche_condivise"), (snapshot) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height); 
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (!data.path || data.path.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(data.path[0].x, data.path[0].y);
            data.path.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.strokeStyle = data.color; ctx.lineWidth = data.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
        });
    });
}

document.getElementById('btn-pulisci-tattiche').addEventListener('click', () => {
    showConfirmModal(
        "CANCELLA MAPPA TATTICA", 
        "Vuoi davvero eliminare tutti i disegni sulla mappa condivisa? L'azione è irreversibile per tutti.", 
        async () => {
            const snapshot = await getDocs(collection(db, "tattiche_condivise"));
            snapshot.forEach(async (docSnap) => { await deleteDoc(doc(db, "tattiche_condivise", docSnap.id)); });
            logActivity(`🧹 La Mappa Tattica è stata azzerata per tutti.`);
            showToast("Mappa tattica azzerata per tutti.", "success");
        }
    );
});

// --- SISTEMA CHAT TATTICA (CON ELIMINAZIONE) ---
function avviaAscoltoChat() {
    const q = query(collection(db, "chat_tattica"), orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
        const box = document.getElementById('chat-messages');
        box.innerHTML = '';
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const date = data.timestamp ? data.timestamp.toDate() : new Date();
            const timeString = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            box.innerHTML += `
                <div class="chat-msg">
                    <div class="chat-msg-header">
                        <div>
                            <span class="chat-sender">${data.sender || 'Admin'}</span> 
                            <span class="chat-time" style="margin-left: 5px;">${timeString}</span>
                        </div>
                        <span class="delete-msg-btn" data-id="${docSnap.id}" title="Elimina per tutti">❌</span>
                    </div>
                    <div>${data.testo}</div>
                </div>
            `;
        });
        box.scrollTop = box.scrollHeight; 
    });
}

document.getElementById('chat-messages').addEventListener('click', (e) => {
    if(e.target.classList.contains('delete-msg-btn')) {
        const msgId = e.target.getAttribute('data-id');
        showConfirmModal("Elimina Messaggio", "Vuoi cancellare questo messaggio per tutti?", async () => {
            await deleteDoc(doc(db, "chat_tattica", msgId));
        });
    }
});

async function inviaMessaggioChat() {
    const input = document.getElementById('chat-input');
    const testo = input.value.trim();
    if (!testo || (!currentUser && !auth.currentUser)) return;
    
    const senderName = currentUser ? currentUser.nome : (auth.currentUser?.email?.split('@')[0] || 'Admin');

    try {
        await addDoc(collection(db, "chat_tattica"), {
            testo: testo, sender: senderName, timestamp: new Date()
        });
        input.value = ''; 
    } catch(e) { console.error(e); }
}

document.getElementById('btn-invia-chat').addEventListener('click', inviaMessaggioChat);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') inviaMessaggioChat();
});

// --- SISTEMA PIANI D'AZIONE ---
document.getElementById('btn-salva-piano').addEventListener('click', async () => {
    if (!currentUser && !auth.currentUser) return;
    
    const titolo = document.getElementById('piano-titolo').value.trim();
    const target = document.getElementById('piano-target').value.trim();
    const fazione = document.getElementById('piano-fazione').value;
    const note = document.getElementById('piano-note').value.trim();

    if(!titolo) { showToast("Inserisci almeno il Titolo dell'Operazione", "error"); return; }

    try {
        await addDoc(collection(db, "piani_operativi"), {
            titolo: titolo, target: target, fazione: fazione, note: note,
            stato: "attesa", timestamp: new Date()
        });
        
        logActivity(`🎯 Nuova Operazione pubblicata: <b>${titolo}</b>`);
        
        document.getElementById('piano-titolo').value = '';
        document.getElementById('piano-target').value = '';
        document.getElementById('piano-fazione').value = '';
        document.getElementById('piano-note').value = '';
        showToast("Nuovo piano operativo pubblicato.", "success");
    } catch (error) {
        console.error(error);
        showToast("Errore durante la creazione del piano.", "error");
    }
});

function avviaAscoltoPiani() {
    const q = query(collection(db, "piani_operativi"), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        const grid = document.getElementById('piani-grid-container');
        grid.innerHTML = '';
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const date = data.timestamp ? data.timestamp.toDate() : new Date();
            const dateString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            let statusClass = "status-attesa";
            if(data.stato === "corso") statusClass = "status-corso";
            if(data.stato === "completata") statusClass = "status-completata";

            grid.innerHTML += `
                <div class="piano-card ${statusClass}">
                    <button class="btn-delete-piano" data-id="${id}" title="Elimina Dossier">✖</button>
                    <div class="piano-header">
                        <div class="piano-title">${data.titolo}</div>
                        <div class="piano-meta">
                            <span><b>Target:</b> ${data.target || 'N/D'}</span>
                            <span><b>Unità:</b> ${data.fazione || 'Non Assegnata'}</span>
                        </div>
                    </div>
                    <div class="piano-body">${data.note || 'Nessun dettaglio operativo fornito.'}</div>
                    <div style="font-size: 0.7rem; color: var(--text-secondary); text-align: right;">Emesso: ${dateString}</div>
                    <div class="piano-actions">
                        <button class="btn-status btn-attesa" data-id="${id}" data-status="attesa">IN ATTESA</button>
                        <button class="btn-status btn-corso" data-id="${id}" data-status="corso">IN CORSO</button>
                        <button class="btn-status btn-completata" data-id="${id}" data-status="completata">COMPLETATA</button>
                    </div>
                </div>
            `;
        });
    });
}

document.getElementById('piani-grid-container').addEventListener('click', async (e) => {
    if(e.target.classList.contains('btn-delete-piano')) {
        const id = e.target.getAttribute('data-id');
        showConfirmModal("Elimina Operazione", "Vuoi cancellare definitivamente questo dossier operativo?", async () => {
            await deleteDoc(doc(db, "piani_operativi", id));
            logActivity(`🗑️ Un Dossier Operativo è stato eliminato.`);
            showToast("Operazione eliminata.", "success");
        });
    }
    if(e.target.classList.contains('btn-status')) {
        const id = e.target.getAttribute('data-id');
        const newStatus = e.target.getAttribute('data-status');
        try {
            await updateDoc(doc(db, "piani_operativi", id), { stato: newStatus });
            logActivity(`🔄 Lo stato di un'operazione è stato aggiornato a: <b>${newStatus.toUpperCase()}</b>`);
        } catch(err) { console.error(err); }
    }
});


// GENERAZIONE UI DATABASE RISORSE E ANELLI A GRIGLIA
const materiali = [ { id: 'mat_oro', nome: 'Oro' }, { id: 'mat_rame', nome: 'Rame' }, { id: 'mat_cotone', nome: 'Cotone' },  { id: 'mat_dmt', nome: 'DMT' }, { id: 'mat_zolfo', nome: 'Zolfo' }, { id: 'mat_grafite', nome: 'Grafite' }, { id: 'mat_carbone', nome: 'Carbone' }, { id: 'mat_cromo', nome: 'Cromo' }, { id: 'mat_salnitro', nome: 'Salnitro' }, { id: 'mat_magnete', nome: 'Magnete' }, { id: 'mat_piombo', nome: 'Piombo' }, { id: 'mat_tabacco', nome: 'Tabacco' }, { id: 'mat_azoto', nome: 'Azoto' }, { id: 'mat_marijuana', nome: 'Marijuana' } ];
const mercanti = [ { id: 'mer_rame', nome: 'Rame' }, { id: 'mer_piombo', nome: 'Piombo' }, { id: 'mer_carbone', nome: 'Carbone' }, { id: 'mer_pile', nome: 'Pile' }, { id: 'mer_cartine', nome: 'Cartine' }, { id: 'mer_grafite', nome: 'Grafite' }, { id: 'mer_tessuto', nome: 'Tessuto' }, { id: 'mer_vetro', nome: 'Vetro' }, { id: 'mer_alcool', nome: 'Alcool' }, { id: 'mer_elettrici', nome: 'Elettrici' } ];
const altari = [ { id: 'alt_motel', nome: 'Altare Motel' }, { id: 'alt_rovine', nome: 'Altare Rovine' }, { id: 'alt_antenne', nome: 'Altare Antenne' },];

function creaCardRisorsa(item, tipo) {
    const div = document.createElement('div');
    div.className = 'resource-card';
    const icon = tipo === 'mat' ? '⛏️' : (tipo === 'mer' ? '💰' : '🔮');
    div.innerHTML = `
        <div class="res-card-header">
            <span class="res-icon">${icon}</span>
            <span class="res-title">${item.nome}</span>
        </div>
        <input type="text" id="quad_${item.id}" class="res-input" placeholder="Quadrante (es. B4)">
    `;
    return div;
}

function creaCardAnello(fazione) {
    const div = document.createElement('div');
    div.className = 'resource-card';
    div.innerHTML = `
        <div class="res-card-header">
            <span class="res-icon" style="text-shadow: 0 0 10px rgba(255,255,255,0.5);">💍</span>
            <span class="res-title" style="color: ${fazione.color};">${fazione.name}</span>
        </div>
        <input type="number" id="anelli_${fazione.id}" class="res-input" placeholder="Q.tà" value="0">
    `;
    return div;
}

materiali.forEach(m => document.getElementById('grid-materiali').appendChild(creaCardRisorsa(m, 'mat')));
mercanti.forEach(m => document.getElementById('grid-mercanti').appendChild(creaCardRisorsa(m, 'mer')));
altari.forEach(a => document.getElementById('grid-altari').appendChild(creaCardRisorsa(a, 'alt')));

fazioniDef.forEach(f => {
    if(f.id !== 'nessuno') document.getElementById('grid-anelli').appendChild(creaCardAnello(f));
});

document.getElementById('btn-salva-risorse').addEventListener('click', async () => {
    if (!currentUser && !auth.currentUser) {
        showToast("Azione negata. Utente non autenticato.", "error");
        return;
    }
    const tutti = [...materiali.map(m => ({...m, tipo: 'mat'})), ...mercanti.map(m => ({...m, tipo: 'mer'})), ...altari.map(a => ({...a, tipo: 'alt'}))];
    
    try {
        // Salva Materiali, Mercanti e Altari
        for (let i of tutti) {
            const val = document.getElementById(`quad_${i.id}`).value.trim();
            await setDoc(doc(db, "punti_interesse", i.id), { nome: i.nome, quadrante: val, type: i.tipo });
        }

        // Salva Anelli
        const anelliDaSalvare = {};
        fazioniDef.forEach(f => {
            if (f.id !== 'nessuno') {
                const val = parseInt(document.getElementById(`anelli_${f.id}`).value) || 0;
                anelliDaSalvare[f.id] = val;
            }
        });
        await setDoc(doc(db, "sistema", "anelli"), anelliDaSalvare, { merge: true });

        logActivity(`🗄️ Il Database Generale (Punti e Anelli) è stato sincronizzato.`);
        showToast("Database Sincronizzato con successo!", "success");
    } catch (error) {
        showToast("Errore durante la sincronizzazione.", "error");
        console.error(error);
    }
});