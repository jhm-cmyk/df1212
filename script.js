import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc,
    enableIndexedDbPersistence,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- إعدادات فايربيس ---
const firebaseConfig = {
    apiKey: "AIzaSyC2zYRUlv-fDsHBVXzAD1w_JTEpR9K8OAg",
    authDomain: "gnsea-6852f.firebaseapp.com",
    projectId: "gnsea-6852f",
    storageBucket: "gnsea-6852f.firebasestorage.app",
    messagingSenderId: "654101837988",
    appId: "1:654101837988:web:0f831b2582f4a8b4fb8e31"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- تفعيل وضع الأوفلاين القوي (Persistence) ---
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.log("⚠️ تعدد التبويبات قد يعيق الحفظ المؤقت");
    } else if (err.code == 'unimplemented') {
        console.log("⚠️ المتصفح لا يدعم الحفظ المحلي");
    }
});

const familiesCol = collection(db, 'families');

// --- متغيرات النظام ---
const items = ["الرز", "السكر", "الزيت", "المعجون", "البقوليات", "الطحين", "رعاية"];
let currentId = null; 
let localDataCache = []; 
let deferredPrompt; 

// --- عند التحميل ---
window.onload = async function() {
    renderTable();
    document.getElementById('dateToday').innerText = new Date().toLocaleDateString('ar-IQ');
    document.getElementById('printDate').innerText = new Date().toLocaleDateString('ar-IQ');
    
    document.querySelector('.bottom-nav').style.display = 'none';
    document.getElementById('searchInput').addEventListener('input', handleSearch);

    // مراقبة حالة الاتصال لتحديث الواجهة
    updateConnectionStatus();
    window.addEventListener('online',  () => { updateConnectionStatus(); fetchDataFromFirestore(); });
    window.addEventListener('offline', () => { updateConnectionStatus(); });
};

function updateConnectionStatus() {
    const statusSpan = document.getElementById('connectionStatus');
    if (navigator.onLine) {
        statusSpan.innerText = 'متصل (تزامن تلقائي) ✅';
        statusSpan.style.color = 'var(--success-color)';
    } else {
        statusSpan.innerText = 'وضع الأوفلاين (محفوظ محلياً) 📱';
        statusSpan.style.color = '#f39c12';
    }
}

// --- نظام الحماية ---
window.checkPin = function() {
    const pin = document.getElementById('pinInput').value;
    if (pin === '1972') {
        document.getElementById('loginOverlay').style.display = 'none';
        document.querySelector('.bottom-nav').style.display = 'flex';
        // تفعيل الاستماع الحي للبيانات (Realtime Listener)
        listenToData(); 
    } else {
        alert('❌ الرمز خطأ');
        document.getElementById('pinInput').value = '';
    }
};

// --- التبويبات ---
window.switchTab = function(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

// --- تثبيت التطبيق PWA ---
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('installBtn');
    if(btn) btn.style.display = 'block';
});

window.installApp = async function() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if(outcome === 'accepted') document.getElementById('installBtn').style.display = 'none';
    }
};

// --- دوال قاعدة البيانات (استماع حي) ---

function listenToData() {
    // استخدام onSnapshot يضمن التحديث التلقائي سواء كنت أونلاين أو أوفلاين
    onSnapshot(familiesCol, (snapshot) => {
        localDataCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboard();
        handleSearch({ target: { value: document.getElementById('searchInput').value } });
    }, (error) => {
        console.log("Offline mode active or permission error");
    });
}

// دالة لجلب البيانات يدوياً عند عودة النت (اختياري لأن onSnapshot تكفي)
async function fetchDataFromFirestore() {
    try {
        const snapshot = await getDocs(familiesCol);
        localDataCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboard();
    } catch (e) { console.log('Working offline...'); }
}

window.saveData = async function() {
    const name = document.getElementById('headName').value;
    const cardNo = document.getElementById('cardNumber').value;
    if (!name || !cardNo) { alert('يرجى كتابة الاسم ورقم البطاقة'); return; }

    let gridData = {};
    items.forEach((item, rIndex) => {
        for (let c = 1; c <= 12; c++) {
            if (document.getElementById(`cell_${rIndex}_${c}`).classList.contains('checked')) {
                gridData[`${rIndex}_${c}`] = true;
            }
        }
    });

    const record = {
        name, cardNo,
        familyCount: document.getElementById('familyCount').value,
        eligibleCount: document.getElementById('eligibleCount').value,
        blockedCount: document.getElementById('blockedCount').value,
        agentName: document.getElementById('agentName').value,
        notes: document.getElementById('notes').value, 
        grid: gridData,
        updatedAt: new Date().toISOString()
    };

    try {
        // إذا كان هناك ID، نقوم بالتحديث، وإلا نقوم بالإضافة
        // هذا يمنع التكرار تماماً لأننا نعتمد على ID المستند
        if (currentId) {
            const docRef = doc(db, "families", currentId);
            await updateDoc(docRef, record);
            alert(navigator.onLine ? '✅ تم التعديل بنجاح' : '📱 تم الحفظ محلياً (سيتم التعديل عند الاتصال)');
        } else {
            await addDoc(familiesCol, record);
            alert(navigator.onLine ? '✅ تم الحفظ بنجاح' : '📱 تم الحفظ محلياً (سيتم الرفع عند الاتصال)');
        }
        
        clearForm();
        
    } catch (e) {
        console.error("Save Error:", e);
        alert('❌ حدث خطأ، ولكن البيانات قد تكون محفوظة محلياً');
    }
};

window.deleteCurrent = async function() {
    if(!currentId || !confirm('هل أنت متأكد من الحذف؟')) return;
    try {
        await deleteDoc(doc(db, "families", currentId));
        alert('تم حذف السجل');
        clearForm();
    } catch (e) {
        alert('خطأ في الحذف');
    }
};

// --- وظائف الواجهة ---

function renderTable() {
    const tbody = document.querySelector('#rationTable tbody');
    tbody.innerHTML = '';
    items.forEach((item, rIndex) => {
        let row = `<tr>
            <td class="row-header" onclick="toggleRow(${rIndex})" title="اضغط لتحديد الكل">${item}</td>`;
        for (let i = 1; i <= 12; i++) {
            row += `<td><div class="check-btn" id="cell_${rIndex}_${i}" onclick="toggleCheck(this)"></div></td>`;
        }
        row += `</tr>`;
        tbody.innerHTML += row;
    });
}

window.toggleCheck = function(el) { el.classList.toggle('checked'); }

window.toggleRow = function(rowIndex) {
    let allChecked = true;
    for (let i = 1; i <= 12; i++) {
        if (!document.getElementById(`cell_${rowIndex}_${i}`).classList.contains('checked')) {
            allChecked = false;
            break;
        }
    }
    for (let i = 1; i <= 12; i++) {
        const cell = document.getElementById(`cell_${rowIndex}_${i}`);
        if (allChecked) cell.classList.remove('checked');
        else cell.classList.add('checked');
    }
};

function updateDashboard() {
    document.getElementById('totalFamilies').innerText = localDataCache.length;
    let individuals = 0;
    localDataCache.forEach(d => individuals += parseInt(d.familyCount || 0));
    document.getElementById('totalIndividuals').innerText = individuals;
}

function handleSearch(e) {
    const q = e.target.value.toLowerCase();
    const res = document.getElementById('searchResults');
    res.innerHTML = '';
    
    let dataToShow = localDataCache;
    if (q.length > 0) {
        dataToShow = localDataCache.filter(d => d.name.includes(q) || d.cardNo.includes(q));
    }

    dataToShow.forEach(d => {
        const div = document.createElement('div');
        div.className = 'search-item';
        div.innerHTML = `<span>${d.name}</span> <span style="color:#aaa">${d.cardNo}</span>`;
        div.onclick = () => loadRecord(d);
        res.appendChild(div);
    });
}

function loadRecord(d) {
    currentId = d.id;
    document.getElementById('headName').value = d.name;
    document.getElementById('cardNumber').value = d.cardNo;
    document.getElementById('familyCount').value = d.familyCount;
    document.getElementById('eligibleCount').value = d.eligibleCount || 0;
    document.getElementById('blockedCount').value = d.blockedCount || 0;
    document.getElementById('agentName').value = d.agentName;
    document.getElementById('notes').value = d.notes || ''; 
    
    document.querySelectorAll('.check-btn').forEach(b => b.classList.remove('checked'));
    if (d.grid) {
        for (const k in d.grid) {
            const cell = document.getElementById(`cell_${k}`);
            if(cell) cell.classList.add('checked');
        }
    }
    window.switchTab('tabHome', document.querySelectorAll('.nav-btn')[0]);
}

window.clearForm = function() {
    currentId = null;
    document.getElementById('headName').value = '';
    document.getElementById('cardNumber').value = '';
    document.getElementById('familyCount').value = 0;
    document.getElementById('eligibleCount').value = 0;
    document.getElementById('blockedCount').value = 0;
    document.getElementById('notes').value = '';
    document.querySelectorAll('.check-btn').forEach(b => b.classList.remove('checked'));
};

window.printReceipt = function() {
    window.print();
};

window.exportData = function() {
    const data = JSON.stringify(localDataCache);
    const blob = new Blob([data], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_cloud_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
};

window.importData = function(input) {
    alert('تنبيه: الاستيراد هنا للعرض فقط.');
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            localDataCache = JSON.parse(e.target.result);
            updateDashboard();
            handleSearch({ target: { value: '' } });
            alert('✅ تم تحميل النسخة المحلية للعرض');
        } catch(err) { alert('❌ ملف خاطئ'); }
    };
    reader.readAsText(file);
};
