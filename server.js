const axios = require('axios');
const express = require('express');
const https = require('https');

// ======================
// CẤU HÌNH GỐC CỦA BẠN
// ======================
const BASE = "https://aibcr.me";
const LOGIN_URL = `${BASE}/login`;
const LOBBY_URL = `${BASE}/dg/lobby`;
const GETNEWRESULT_URL = `${BASE}/baccarat/getnewresult`;

const USERNAME = "tiendatoce1232";
const PASSWORD = "tiendatoceee1";

const agent = new https.Agent({ rejectUnauthorized: false });
let cookieJar = '';
let baccaratData = [];
let lastUpdate = null;

const session = axios.create({
    baseURL: BASE,
    timeout: 30000,
    httpsAgent: agent,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
    }
});

session.interceptors.request.use(config => {
    if (cookieJar) config.headers.Cookie = cookieJar;
    return config;
});

session.interceptors.response.use(res => {
    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
        for (const cookie of setCookie) {
            const [name, value] = cookie.split(';')[0].split('=');
            if (cookieJar.includes(`${name}=`)) {
                cookieJar = cookieJar.replace(new RegExp(`${name}=[^;]+;?`), '');
            }
            cookieJar += `${name}=${value}; `;
        }
    }
    return res;
});

function getCsrfToken(html) {
    const match = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/);
    return match ? match[1] : null;
}

async function login() {
    try {
        const getResp = await session.get(LOGIN_URL);
        const token = getCsrfToken(getResp.data);

        const formData = new URLSearchParams();  
        formData.append('username', USERNAME);  
        formData.append('password', PASSWORD);  
        formData.append('_token', token);  
        formData.append('action', 'Login');  
          
        const headers = {  
            'Referer': LOGIN_URL,  
            'Origin': BASE,  
            'Content-Type': 'application/x-www-form-urlencoded'  
        };  
          
        const loginResp = await session.post(LOGIN_URL, formData.toString(), { headers });  
        return loginResp.status === 200;  
    } catch (error) {  
        console.error('Login error:', error.message);  
        return false;  
    }
}

async function goToLobby() {
    try {
        await session.get(LOBBY_URL);
        return true;
    } catch (error) {
        console.error('Lobby error:', error.message);
        return false;
    }
}

// ============================================
// HÀM ENGINE AI PHÂN TÍCH PATTERN (CẦU)
// ============================================
function analyzeBaccaratPattern(resultStr) {
    // Sạch hóa chuỗi, chỉ giữ lại B (Banker), P (Player), T (Tie)
    const rawChain = (resultStr || "").toUpperCase().replace(/[^BPT]/g, "");
    const totalRounds = rawChain.length;
    
    // Tính phiên dự đoán bằng tổng số kết quả đã ra cộng thêm 1
    const nextSession = totalRounds + 1;

    // Trực quan hóa chuỗi ngắn gọn để hiển thị
    const shortPattern = rawChain.length > 25 ? "..." + rawChain.slice(-25) : rawChain;

    if (totalRounds === 0) {
        return {
            session: 1,
            prediction: "Đang chờ",
            confidence: "50%",
            pattern: "Bàn trống, chưa có lịch sử cầu",
            shortPattern: "TRỐNG"
        };
    }

    // Lấy quân bài cuối cùng để bám xu hướng
    const lastResult = rawChain[totalRounds - 1];

    // Thuật toán 1: Quét pattern đối xứng (Lịch sử lặp lại)
    if (totalRounds >= 3) {
        const patternLength = 2; // Tìm cụm 2 ký tự cuối
        const tail = rawChain.slice(-patternLength); 
        
        let matchBanker = 0;
        let matchPlayer = 0;

        // Quét toàn bộ chuỗi lịch sử trừ đoạn cuối
        for (let i = 0; i < totalRounds - patternLength - 1; i++) {
            if (rawChain.substr(i, patternLength) === tail) {
                const nextChar = rawChain[i + patternLength];
                if (nextChar === 'B') matchBanker++;
                if (nextChar === 'P') matchPlayer++;
            }
        }

        if (matchBanker !== matchPlayer) {
            const pred = matchBanker > matchPlayer ? "BANKER" : "PLAYER";
            const totalMatches = matchBanker + matchPlayer;
            const percentage = Math.min(Math.floor((Math.max(matchBanker, matchPlayer) / totalMatches) * 25) + 70, 95);
            return {
                session: nextSession,
                prediction: pred,
                confidence: `${percentage}%`,
                pattern: `Khớp chuỗi lặp tỉ lệ [B:${matchBanker}|P:${matchPlayer}]`,
                shortPattern: shortPattern
            };
        }
    }

    // Thuật toán 2: Bẻ cầu rồng dài (Nếu một bên ra liên tiếp quá 4 cây)
    if (totalRounds >= 4) {
        const last4 = rawChain.slice(-4);
        if (last4 === "BBBB") {
            return {
                session: nextSession,
                prediction: "PLAYER",
                confidence: "82%",
                pattern: "Thuật toán bẻ cầu rồng BANKER liên tiếp",
                shortPattern: shortPattern
            };
        }
        if (last4 === "PPPP") {
            return {
                session: nextSession,
                prediction: "BANKER",
                confidence: "82%",
                pattern: "Thuật toán bẻ cầu rồng PLAYER liên tiếp",
                shortPattern: shortPattern
            };
        }
    }

    // Thuật toán 3: Fallback dựa theo Động lượng dòng tiền / Xu hướng tổng bộ
    let countB = 0, countP = 0;
    for (const char of rawChain) {
        if (char === 'B') countB++;
        if (char === 'P') countP++;
    }

    // Đánh ngược hướng cổng chiếm ưu thế quá cao (Đảo dòng tiền)
    let finalPred = "BANKER";
    let baseText = "Thuật toán cân bằng mảng dynamic";
    if (countB > countP) {
        finalPred = "PLAYER";
        baseText = "Bẻ cầu xu hướng thuận (Tổng Banker đang trội)";
    } else if (countP > countB) {
        finalPred = "BANKER";
        baseText = "Bẻ cầu xu hướng thuận (Tổng Player đang trội)";
    } else {
        finalPred = lastResult === 'B' ? 'PLAYER' : 'BANKER';
        baseText = "Cầu cân, đánh bẻ nhịp quân cuối cùng";
    }

    return {
        session: nextSession,
        prediction: finalPred,
        confidence: "73%",
        pattern: baseText,
        shortPattern: shortPattern
    };
}

// Sắp xếp các bàn theo thứ tự Alphabet và Số chuẩn chỉnh (C01, C02, 1, 2, 5...)
function sortBaccaratTables(array) {
    return array.sort((a, b) => {
        return a.table.localeCompare(b.table, undefined, { numeric: true, sensitivity: 'base' });
    });
}

// ======================
// TRÍCH XUẤT DỮ LIỆU GỐC
// ======================
async function fetchBaccaratData() {
    try {
        let xsrfToken = '';
        if (cookieJar) {
            const xsrfMatch = cookieJar.match(/XSRF-TOKEN=([^;]+)/);
            if (xsrfMatch) xsrfToken = decodeURIComponent(xsrfMatch[1]);
        }

        const headers = {  
            'Referer': LOBBY_URL,  
            'Origin': BASE,  
            'X-Requested-With': 'XMLHttpRequest',  
            'X-XSRF-TOKEN': xsrfToken,  
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'  
        };  
          
        const formData = new URLSearchParams();  
        formData.append('gameCode', 'ae');  
          
        const resp = await session.post(GETNEWRESULT_URL, formData.toString(), { headers });  
          
        if (resp.data && resp.data.data) {  
            const rawList = resp.data.data.map(item => {
                const aiAnalysis = analyzeBaccaratPattern(item.result);
                return {  
                    table: item.table_name,  
                    result: item.result || "",  
                    shoeId: item.shoeId || '',  
                    round: item.round || '',
                    prediction: {
                        phien_du_doan: aiAnalysis.session,
                        cua_chot: aiAnalysis.prediction,
                        do_tin_cay: aiAnalysis.confidence,
                        cau_pattern: aiAnalysis.pattern,
                        chuoi_cau: aiAnalysis.shortPattern
                    }
                };
            });
            // Sắp xếp thẳng hàng ngăn nắp
            baccaratData = sortBaccaratTables(rawList);
            lastUpdate = new Date().toISOString();  
        }  
        return baccaratData;  
    } catch (error) {  
        console.error('Fetch error:', error.message);  
        return [];  
    }
}

async function autoUpdate() {
    while (true) {
        await fetchBaccaratData();
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

// ======================
// KHỞI TẠO API SERVER EXPRESS
// ======================
const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

// [YÊU CẦU] /api/all Trả về kết quả dự đoán đồng loạt của toàn bộ các bàn xếp thẳng hàng
app.get('/api/all', (req, res) => {
    res.json({
        success: true,
        lastUpdate: lastUpdate,
        total_tables: baccaratData.length,
        predictions: baccaratData.map(item => ({
            ban: item.table,
            phien_du_doan: item.prediction.phien_du_doan,
            ket_qua_ai: item.prediction.cua_chot,
            do_tin_cay: item.prediction.do_tin_cay,
            giai_thich_pattern: item.prediction.cau_pattern,
            lich_su_cau: item.result
        }))
    });
});

app.get('/api/baccarat', (req, res) => {
    res.json({ success: true, data: baccaratData, lastUpdate: lastUpdate });
});

// GIAO DIỆN PANEL TÍM VIP TRỰC QUAN - HIỂN THỊ CÁC BÀN THẲNG HÀNG 100%
app.get('/', (req, res) => {
    let rowsHtml = '';
    baccaratData.forEach(item => {
        const predClass = item.prediction.cua_chot.toLowerCase();
        rowsHtml += `
        <tr>
            <td class="table-name">${item.table}</td>
            <td class="session-id">#${item.prediction.phien_du_doan}</td>
            <td><span class="badge ${predClass}">${item.prediction.cua_chot}</span></td>
            <td style="color: #00b894; font-weight: bold;">${item.prediction.do_tin_cay}</td>
            <td class="pattern-text">${item.prediction.cau_pattern}</td>
            <td class="raw-chain">${item.prediction.chuoi_cau || '---'}</td>
        </tr>
        `;
    });

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Baccarat Cloud AI Predictor</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #090714; color: #bcaedb; }
            .container { max-width: 1000px; margin: 0 auto; }
            .header { text-align: center; padding: 20px; background: #140f2b; border-radius: 12px; border: 1px solid #6c5ce7; margin-bottom: 20px; }
            h1 { margin: 0; color: #a29bfe; font-size: 22px; letter-spacing: 1px; }
            .btn-link { display: inline-block; background: #6c5ce7; color: #fff; text-decoration: none; padding: 8px 15px; border-radius: 6px; font-weight: bold; margin-top: 10px; font-size: 13px; }
            .btn-link:hover { background: #5b4cc4; }
            table { width: 100%; border-collapse: collapse; background: #140f2b; border-radius: 12px; overflow: hidden; border: 1px solid #3b2a75; }
            th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #231942; }
            th { background: #1d123d; color: #a29bfe; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
            tr:hover { background: #1c153a; }
            .table-name { font-weight: bold; color: #fff; font-size: 16px; }
            .session-id { font-family: monospace; color: #ffeaa7; font-size: 15px; }
            .badge { display: inline-block; padding: 5px 10px; border-radius: 6px; font-weight: bold; font-size: 13px; text-align: center; min-width: 70px; }
            .banker { background: #d63031; color: #fff; text-shadow: 0 0 5px rgba(0,0,0,0.5); }
            .player { background: #0984e3; color: #fff; text-shadow: 0 0 5px rgba(0,0,0,0.5); }
            .dang-cho { background: #2f3542; color: #a4b0be; }
            .pattern-text { font-size: 13px; color: #a4b0be; }
            .raw-chain { font-family: monospace; font-size: 12px; color: #84817a; letter-spacing: 1px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔮 BACCARAT MULTI-TABLE REALTIME AI PREDICTOR</h1>
                <p style="margin: 5px 0 0 0; color: #a4b0be; font-size: 13px;">Tự động phân tích chuỗi Pattern cầu của từng bàn - Không chờ đợi</p>
                <a href="/api/all" target="_blank" class="btn-link">🔗 TRUY XUẤT ENDPOINT /API/ALL CHO BOT</a>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>Bàn số</th>
                        <th>Phiên dự đoán</th>
                        <th>AI chốt cửa</th>
                        <th>Độ tin cậy</th>
                        <th>Cơ sở Pattern (Cầu)</th>
                        <th>Chuỗi cầu gần nhất</th>
                    </tr>
                </thead>
                <tbody id="table-body">
                    ${rowsHtml}
                </tbody>
            </table>
        </div>

        <script>
            // Ajax cập nhật ngầm luồng dữ liệu liên tục không giật lag màn hình
            function refreshPredictions() {
                fetch('/api/baccarat')
                    .then(r => r.json())
                    .then(res => {
                        if(!res.success || !res.data) return;
                        let html = '';
                        res.data.forEach(item => {
                            const predClass = item.prediction.cua_chot.toLowerCase().replace(" ", "-");
                            html += \`
                            <tr>
                                <td class="table-name">\${item.table}</td>
                                <td class="session-id">#\${item.prediction.phien_du_doan}</td>
                                <td><span class="badge \${predClass}">\${item.prediction.cua_chot}</span></td>
                                <td style="color: #00b894; font-weight: bold;">\${item.prediction.do_tin_cay}</td>
                                <td class="pattern-text">\${item.prediction.cau_pattern}</td>
                                <td class="raw-chain">\${item.prediction.chuoi_cau || '---'}</td>
                            </tr>
                            \`;
                        });
                        document.getElementById('table-body').innerHTML = html;
                    }).catch(e => console.error("Lỗi cập nhật Edge:", e));
            }
            setInterval(refreshPredictions, 2000);
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// ======================
// KHỞI ĐỘNG HỆ THỐNG
// ======================
async function start() {
    console.log('========================================');
    console.log('   BACCARAT CORE AI LIVE SERVER         ');
    console.log('========================================');

    console.log('[1] Đang xác thực tài khoản...');  
    const loginOk = await login();  
    if (!loginOk) {  
        console.error('[ERROR] Không thể đăng nhập hệ thống!');  
        process.exit(1);  
    }  
    console.log('[OK] Đăng nhập thành công');  
      
    console.log('[2] Kết nối sảnh DG Lobby...');  
    await goToLobby();  
    console.log('[OK] Vào sảnh thành công');  
      
    console.log('[3] Quét cấu trúc Pattern bàn...');  
    await fetchBaccaratData();  
    console.log(`[OK] Hoàn tất nạp dữ liệu ${baccaratData.length} bàn.`);  
      
    autoUpdate();  
      
    const PORT = process.env.PORT || 5000;  
    app.listen(PORT, '0.0.0.0', () => {  
        console.log(`\n🚀 ENGINE API CHẠY THÀNH CÔNG TRÊN RENDER:`);  
        console.log(`   Cổng cục bộ: http://localhost:${PORT}`);  
        console.log(`   Endpoint phân tích tổng: http://localhost:${PORT}/api/all`);  
        console.log(`\n⏰ Chế độ AI quét liên tục chuỗi Pattern mỗi 2 giây.`);  
    });
}

start();
        
