import { useState, useRef, useEffect } from "react";
import { db, auth } from "./firebase";
import { collection, addDoc, onSnapshot, doc, getDoc, setDoc, deleteDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

const ICONS = ["🎨","🖌️","✏️","📐","💡","🔍","🌸","🌙","⭐","🔥","💫","🌊","🦋","🌿","🎯","🦄","🐼","🐸","🦊","🐱"];
const TAGS = ["タイポグラフィ", "余白", "配色", "レイアウト", "世界観", "構成", "テクスチャ", "グリッド", "コンセプト", "視線誘導", "テーマの面白さ", "課題解決の仕方"];
const QUESTIONS = [
  { id: "q1", label: "どこに惹かれた？", placeholder: "最初に目が止まった場所" },
  { id: "q2", label: "作者の視点の仮説", placeholder: "どんな意図で作ったんだろう" },
  { id: "q3", label: "このデザインが解いている課題・テーマの仮説", placeholder: "どんな問いや目的があって作られたんだろう" },
  { id: "q4", label: "自分の作品に持ち込めること", placeholder: "具体的に学べること" },
];
// ★ デザインフェーズ定義
const PHASES = [
  { id: "theme",      label: "テーマ・問いの設定", desc: "何を解くかの設定が面白い",     color: "#FF6B6B" },
  { id: "research",   label: "リサーチ・観察",     desc: "調査や視点の切り口が面白い",   color: "#FF9F43" },
  { id: "concept",    label: "仮説・コンセプト",   desc: "解釈やコンセプト設計が面白い", color: "#54A0FF" },
  { id: "solution",   label: "解決策・アイデア",   desc: "アイデアの発想が面白い",       color: "#5F27CD" },
  { id: "expression", label: "表現・仕上げ",       desc: "ビジュアルや表現が面白い",     color: "#00D2D3" },
];
const EMPTY_ENTRY = { title: "", source: "", url: "", images: [] as string[], pdfData: null, color: "#C8C8C8", tags: [], phase: "" as string, answers: { q1: "", q2: "", q3: "", q4: "" }, memo: "", firstImpression: "" };

// 画像をcanvasで圧縮（800px・JPEG70%）
function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > h && w > MAX) { h = h * MAX / w; w = MAX; }
        else if (h > MAX) { w = w * MAX / h; h = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const inputStyle = { display: "block", width: "100%", padding: "14px 16px", fontSize: 15, border: "none", background: "transparent", fontFamily: "inherit", outline: "none" };

function FormSheetComponent({ closeSheet, saveEntry, sheetMode, fileInputRef, handleImageUpload, urlInput, setUrlInput, fetchingUrl, handleUrlFetch, formEntry, setFormEntry, generatingAI, generateWithAI, aiVersion, aiError, setAiError, firstImpressionRef }) {
  const sheetRef = useRef<HTMLDivElement>(null);

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
    e.preventDefault();
    e.stopPropagation();
    const scrollTop = sheetRef.current?.scrollTop ?? 0;
    setFormEntry(p => ({ ...p, tags: p.tags.includes(tag) ? p.tags.filter(t => t !== tag) : [...p.tags, tag] }));
    requestAnimationFrame(() => {
      if (sheetRef.current) sheetRef.current.scrollTop = scrollTop;
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }}>
      <div ref={sheetRef} style={{ background: "#F2F2F7", width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", borderRadius: "20px 20px 0 0", padding: "0 0 32px" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, background: "#D1D1D6", borderRadius: 99 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px 20px" }}>
          <button onClick={closeSheet} style={{ background: "none", border: "none", color: "#007AFF", fontSize: 17, cursor: "pointer" }}>キャンセル</button>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{sheetMode === "edit" ? "編集" : "新しい解剖"}</div>
          <button onClick={saveEntry} style={{ background: "none", border: "none", color: "#007AFF", fontSize: 17, fontWeight: 600, cursor: "pointer" }}>保存</button>
        </div>
        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* URL取得 */}
          <div style={{ background: "#fff", borderRadius: 14, display: "flex", overflow: "hidden" }}>
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleUrlFetch()} placeholder="URLを貼り付けて自動取得" style={{ flex: 1, padding: "14px 16px", fontSize: 14, border: "none", background: "transparent", fontFamily: "inherit", outline: "none" }} />
            <button onClick={handleUrlFetch} disabled={fetchingUrl} style={{ background: fetchingUrl ? "#E5E5EA" : "#007AFF", color: fetchingUrl ? "#8E8E93" : "#fff", border: "none", padding: "0 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{fetchingUrl ? "取得中..." : "取得"}</button>
          </div>

          {/* ★ 複数枚画像エリア */}
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: "none" }} multiple />
          <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>画像（複数追加可）</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(formEntry.images || []).map((img, i) => (
                <div key={i} style={{ position: "relative", width: 80, height: 80, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
                  <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button type="button" onClick={() => setFormEntry(p => ({ ...p, images: p.images.filter((_, idx) => idx !== i) }))} style={{ position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 99, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button>
                </div>
              ))}
              <div onClick={() => fileInputRef.current.click()} style={{ width: 80, height: 80, borderRadius: 10, background: "#F2F2F7", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                <span style={{ fontSize: 22, color: "#007AFF" }}>+</span>
                <span style={{ fontSize: 10, color: "#8E8E93", marginTop: 2 }}>追加</span>
              </div>
            </div>
          </div>

          {/* タイトル・出典 */}
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden" }}>
            <input defaultValue={formEntry.title} onBlur={e => setFormEntry(p => ({ ...p, title: e.target.value }))} placeholder="作品名" style={{ ...inputStyle, borderBottom: "0.5px solid #E5E5EA" }} />
            <input defaultValue={formEntry.source} onBlur={e => setFormEntry(p => ({ ...p, source: e.target.value }))} placeholder="どこで見た？（re:designer, Behance...）" style={inputStyle} />
          </div>

          {/* ★ 第一印象: onChangeで即時反映 + refで確実に値を取得 */}
          <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>💬 なぜ良いと思った？</div>
            <textarea
              ref={firstImpressionRef}
              defaultValue={formEntry.firstImpression || ""}
              onBlur={e => setFormEntry(p => ({ ...p, firstImpression: e.target.value }))}
              rows={2}
              placeholder="なぜ良いと思った？一言で"
              style={{ width: "100%", border: "none", fontSize: 15, color: "#000", background: "transparent", lineHeight: 1.5, fontFamily: "inherit", resize: "none", outline: "none" }}
            />
            <div style={{ fontSize: 11, color: "#C7C7CC", marginTop: 4 }}>これをもとにAIが解剖します</div>
          </div>

          <button onClick={generateWithAI} disabled={generatingAI} style={{ width: "100%", background: generatingAI ? "#5856D6" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "#fff", border: "none", padding: "16px", borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: generatingAI ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: generatingAI ? 0.8 : 1 }}>
            {generatingAI ? <><span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 18 }}>⏳</span> AI解剖中...</> : <>✨ AIで解剖してみる</>}
          </button>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          {aiError && <div style={{ background: "#FFF3CD", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#856404" }}>{aiError}</div>}

          {/* タグ */}
          <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>惹かれた要素</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {TAGS.map(tag => (
                <button type="button" key={tag} onClick={(e) => handleTagClick(e, tag)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, background: formEntry.tags.includes(tag) ? "#007AFF" : "#F2F2F7", color: formEntry.tags.includes(tag) ? "#fff" : "#3C3C43", border: "none", cursor: "pointer", fontFamily: "inherit" }}>{tag}</button>
              ))}
            </div>
          </div>

          {/* 解剖Q&A */}
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden" }}>
            {QUESTIONS.map((q, i) => (
              <div key={q.id} style={{ borderBottom: "0.5px solid #E5E5EA", padding: "14px 16px" }}>
                <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{String(i + 1).padStart(2, "0")} · {q.label}</div>
                <textarea key={`${q.id}-${aiVersion}`} defaultValue={formEntry.answers[q.id]} onBlur={e => setFormEntry(p => ({ ...p, answers: { ...p.answers, [q.id]: e.target.value } }))} rows={2} placeholder={q.placeholder} style={{ width: "100%", border: "none", fontSize: 15, color: "#000", background: "transparent", lineHeight: 1.5, fontFamily: "inherit", resize: "none", outline: "none" }} />
              </div>
            ))}
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>その他 · メモ</div>
              <textarea key={`memo-${aiVersion}`} defaultValue={formEntry.memo || ""} onBlur={e => setFormEntry(p => ({ ...p, memo: e.target.value }))} rows={3} placeholder="上記以外で気になったこと" style={{ width: "100%", border: "none", fontSize: 15, color: "#000", background: "transparent", lineHeight: 1.5, fontFamily: "inherit", resize: "none", outline: "none" }} />
            </div>
          </div>

          {/* ★ フェーズ選択: Q&Aの下に移動 */}
          <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>この作品の面白さはどのフェーズ？</div>
            <div style={{ fontSize: 11, color: "#C7C7CC", marginBottom: 12 }}>AI解剖を読んだ上で、自分で選ぼう</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PHASES.map((phase, i) => {
                const selected = formEntry.phase === phase.id;
                return (
                  <button type="button" key={phase.id} onClick={(e) => { e.preventDefault(); const scrollTop = sheetRef.current?.scrollTop ?? 0; setFormEntry(p => ({ ...p, phase: p.phase === phase.id ? "" : phase.id })); requestAnimationFrame(() => { if (sheetRef.current) sheetRef.current.scrollTop = scrollTop; }); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12, background: selected ? phase.color + "18" : "#F2F2F7", border: selected ? `1.5px solid ${phase.color}` : "1.5px solid transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 99, background: selected ? phase.color : "#E5E5EA", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: selected ? phase.color : "#000" }}>{phase.label}</div>
                      <div style={{ fontSize: 11, color: "#8E8E93", marginTop: 1 }}>{phase.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get("project");

  // Auth state
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // プロフィール
  const [userProfile, setUserProfile] = useState(() => {
    try { const s = localStorage.getItem("naosu-profile"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [settingProfile, setSettingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", icon: "🎨" });

  const [view, setView] = useState("home");
  const [entries, setEntries] = useState<any[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) { setEntries([]); setEntriesLoading(false); return; }
    const q = query(collection(db, "users", currentUser.uid, "entries"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.empty ? [] : snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setEntriesLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  const [selected, setSelected] = useState<any>(null);
  const [sheetMode, setSheetMode] = useState<string | null>(null);
  const [formEntry, setFormEntry] = useState<any>(EMPTY_ENTRY);
  const [imagePreview, setImagePreview] = useState<number | null>(null); // ★ 何枚目を表示中か
  const [sharedEntries, setSharedEntries] = useState<any[]>([]);
  const [detailProjectData, setDetailProjectData] = useState<any>(null);
  const fileInputRef = useRef<any>(null);
  const firstImpressionRef = useRef<HTMLTextAreaElement>(null); // ★ 第一印象を確実に取得
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selected?.projectId) { setSharedEntries([]); setDetailProjectData(null); return; }
    const fetchDetail = async () => {
      const snap = await getDoc(doc(db, "projects", selected.projectId));
      if (snap.exists()) setDetailProjectData(snap.data());
    };
    fetchDetail();
    const unsub = onSnapshot(collection(db, "projects", selected.projectId, "entries"), (snap) => {
      setSharedEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selected?.projectId]);

  const [projectData, setProjectData] = useState<any>(null);
  const [projectEntries, setProjectEntries] = useState<any[]>([]);
  const [userName, setUserName] = useState("");
  const [userNameSet, setUserNameSet] = useState(false);
  const [projectSubmitted, setProjectSubmitted] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectImage, setNewProjectImage] = useState<string | null>(null);
  const [projectUrl, setProjectUrl] = useState<string | null>(null);
  const [creatingProjectLoading, setCreatingProjectLoading] = useState(false);
  const projectFileRef = useRef<any>(null);

  useEffect(() => {
    if (!projectId) return;
    const fetchProject = async () => {
      const snap = await getDoc(doc(db, "projects", projectId));
      if (snap.exists()) setProjectData(snap.data());
    };
    fetchProject();
    const unsub = onSnapshot(collection(db, "projects", projectId, "entries"), (snap) => {
      setProjectEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [projectId]);

  useEffect(() => {
    if (userProfile && projectId) { setUserName(userProfile.name); setUserNameSet(true); }
  }, [userProfile, projectId]);

  const tagCounts: Record<string, number> = {};
  entries.forEach(e => (e.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const maxCount = Math.max(...Object.values(tagCounts), 1);
  const [insightTag, setInsightTag] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const diagnosisCountRef = useRef(0);

  useEffect(() => {
    if (entries.length < 5) { setDiagnosis(""); return; }
    // entriesの数が変わった時だけ再生成
    if (diagnosisCountRef.current === entries.length) return;
    diagnosisCountRef.current = entries.length;
    const generate = async () => {
      setDiagnosisLoading(true);
      try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        const data = entries.slice(-30).map(e => ({
          title: e.title,
          tags: e.tags || [],
          phase: e.phase || "",
          firstImpression: e.firstImpression || "",
        }));
        const prompt = `デザイン学生の解剖図鑑データを分析して、今の段階でこの人がどんな面白さに気づける人かを診断してください。

解剖データ:
${data.map(e => `・${e.title}｜タグ[${e.tags.join(",")}]｜フェーズ[${e.phase}]｜第一印象「${e.firstImpression}」`).join("\n")}

「あなたは今〜な面白さに気づける人です」という形で、現時点での審美眼を80文字以内で一言診断してください。説明は不要、診断文だけ返してください。`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
        );
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text) setDiagnosis(text.trim());
      } catch {}
      setDiagnosisLoading(false);
    };
    generate();
  }, [entries.length]);

  const toggleTag = (tag: string) => setFormEntry(p => ({ ...p, tags: p.tags.includes(tag) ? p.tags.filter(t => t !== tag) : [...p.tags, tag] }));

  const [urlInput, setUrlInput] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);

  const handleUrlFetch = async () => {
    if (!urlInput) return;
    setFetchingUrl(true);
    try {
      const hostname = new URL(urlInput).hostname.replace("www.", "");
      const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=256`;
      let title = "";
      try {
        const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(urlInput)}`);
        const data = await res.json();
        title = data?.data?.title || "";
      } catch {}
      setFormEntry(p => ({ ...p, url: urlInput, title: p.title || title, source: p.source || hostname, images: p.images?.length ? p.images : [faviconUrl], color: "#1A1A2E" }));
    } catch {
      try {
        const hostname = new URL(urlInput).hostname.replace("www.", "");
        setFormEntry(p => ({ ...p, url: urlInput, source: p.source || hostname }));
      } catch {}
    }
    setFetchingUrl(false);
  };

  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiVersion, setAiVersion] = useState(0);
  const [aiError, setAiError] = useState("");

  const generateWithAI = async () => {
    const titleEl = document.querySelector('input[placeholder="作品名"]') as HTMLInputElement;
    const sourceEl = document.querySelector('input[placeholder="どこで見た？（re:designer, Behance...）"]') as HTMLInputElement;
    const titleVal = titleEl?.value || formEntry.title || formEntry.url || "";
    const sourceVal = sourceEl?.value || formEntry.source || "";
    // ★ refで第一印象を確実に取得（onBlur待ち不要）
    const firstImpression = firstImpressionRef.current?.value || formEntry.firstImpression || "";

    setGeneratingAI(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const jsonInstruction = `回答は全て10〜20文字以内の短い一言にしてください。必ずJSON形式のみで返してください（説明文や\`\`\`は不要）: {"q1":"惹かれた点（一言）","q2":"作者の意図の仮説（一言）","q3":"解いている課題の仮説（一言）","q4":"この人がまだ取り込めていない・足りていない要素を具体的に一言で"}`;

      let parts: any[] = [];
      const firstImage = (formEntry.images || [])[0];

      if (firstImage && firstImage.startsWith("data:image")) {
        const base64 = firstImage.split(",")[1];
        const mimeType = firstImage.split(";")[0].split(":")[1];
        parts = [
          { text: `デザイン学生がこのデザイン作品を解剖しています。${titleVal ? `作品名: ${titleVal}` : ""}${sourceVal ? ` 出典: ${sourceVal}` : ""}${firstImpression ? `\n\n学生の第一印象: 「${firstImpression}」` : ""}\n\n画像を見て、第一印象を踏まえた上で4つの問いに対する仮説を日本語で生成してください。\n\n${jsonInstruction}` },
          { inline_data: { mime_type: mimeType, data: base64 } }
        ];
      } else {
        parts = [{ text: `デザイン学生がデザイン作品を解剖しています。\n作品: ${titleVal || "不明"}\n${sourceVal ? `出典: ${sourceVal}` : ""}${firstImpression ? `\n学生の第一印象: 「${firstImpression}」` : ""}\n\n第一印象を踏まえて4つの問いに対する仮説を日本語で生成してください。\n\n${jsonInstruction}` }];
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts }] }) }
      );
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) throw new Error("empty response");
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("no json found");
      const parsed = JSON.parse(jsonMatch[0]);
      setFormEntry(p => ({ ...p, answers: { q1: parsed.q1 || p.answers.q1, q2: parsed.q2 || p.answers.q2, q3: parsed.q3 || p.answers.q3, q4: parsed.q4 || p.answers.q4 } }));
      setAiVersion(v => v + 1);
    } catch (e: any) {
      setAiError(e.message === "empty response" ? "レート制限中です。1〜2分待ってから試してください。" : "エラーが発生しました。もう一度試してください。");
    }
    setGeneratingAI(false);
  };

  // ★ 複数枚対応: 複数ファイル選択 → 全部圧縮して追加
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const compressed = await Promise.all(files.filter(f => f.type !== "application/pdf").map(f => compressImage(f)));
    setFormEntry(p => ({ ...p, images: [...(p.images || []), ...compressed] }));
    e.target.value = "";
  };

  const handleProjectImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const url = await compressImage(file);
    setNewProjectImage(url);
  };

  const openCreate = () => { setFormEntry(EMPTY_ENTRY); setUrlInput(""); setSheetMode("create"); };
  const openEdit = (entry: any) => { setFormEntry({ ...entry, images: entry.images || (entry.image ? [entry.image] : []) }); setUrlInput(""); setSheetMode("edit"); };
  const closeSheet = () => { setSheetMode(null); setFormEntry(EMPTY_ENTRY); setUrlInput(""); };

  const saveEntry = async () => {
    if (!formEntry.title || !currentUser || saving) return;
    setSaving(true);
    try {
      const date = new Date().toLocaleDateString("ja-JP").replace(/\//g, ".");
      const data = { ...formEntry, images: formEntry.images || [], image: undefined, date };
      delete data.image;
      if (sheetMode === "create") {
        const docRef = await addDoc(collection(db, "users", currentUser.uid, "entries"), { ...data, createdAt: serverTimestamp() });
        setSelected({ ...data, id: docRef.id });
      } else {
        await setDoc(doc(db, "users", currentUser.uid, "entries", formEntry.id), { ...data, updatedAt: serverTimestamp() });
        setSelected({ ...data });
      }
      closeSheet();
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;
    await deleteDoc(doc(db, "users", currentUser.uid, "entries", id));
  };

  const shareProject = async (entry: any) => {
    const firstImg = (entry.images || [])[0] || null;
    const docRef = await addDoc(collection(db, "projects"), {
      title: entry.title, image: firstImg, source: entry.source, url: entry.url || "",
      ownerAnswers: entry.answers, ownerTags: entry.tags, ownerMemo: entry.memo || "",
      createdAt: serverTimestamp(),
    });
    const pid = docRef.id;
    if (currentUser && entry.id) {
      await setDoc(doc(db, "users", currentUser.uid, "entries", entry.id), { ...entry, projectId: pid });
    }
    setEntries(p => p.map(e => e.id === entry.id ? { ...e, projectId: pid } : e));
    setSelected(s => s ? { ...s, projectId: pid } : s);
    setProjectUrl(`${window.location.origin}/?project=${pid}`);
    setCreatingProject(true);
  };

  const openDetail = (entry: any) => { setSelected(entry); setView("detail"); };

  const handleAuth = async () => {
    setAuthSubmitting(true); setAuthError("");
    try {
      if (authMode === "signup") await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      else await signInWithEmailAndPassword(auth, authEmail, authPassword);
    } catch (e: any) {
      const msg: Record<string, string> = {
        "auth/email-already-in-use": "このメールアドレスは既に使用されています",
        "auth/invalid-email": "メールアドレスの形式が正しくありません",
        "auth/weak-password": "パスワードは6文字以上にしてください",
        "auth/user-not-found": "アカウントが見つかりません",
        "auth/wrong-password": "パスワードが間違っています",
        "auth/invalid-credential": "メールアドレスまたはパスワードが間違っています",
      };
      setAuthError(msg[e.code] || "エラーが発生しました");
    }
    setAuthSubmitting(false);
  };

  const createProject = async () => {
    if (!newProjectTitle || creatingProjectLoading) return;
    setCreatingProjectLoading(true);
    try {
      const docRef = await addDoc(collection(db, "projects"), { title: newProjectTitle, image: newProjectImage, createdAt: serverTimestamp() });
      setProjectUrl(`${window.location.origin}/?project=${docRef.id}`);
    } finally {
      setCreatingProjectLoading(false);
    }
  };

  const submitProjectEntry = async () => {
    if (!userName || !projectId) return;
    const answers: Record<string, string> = {};
    QUESTIONS.forEach(q => { answers[q.id] = formEntry.answers[q.id] || ""; });
    await addDoc(collection(db, "projects", projectId, "entries"), {
      userName, userIcon: userProfile?.icon || "🎨", tags: formEntry.tags, answers, memo: formEntry.memo || "", createdAt: serverTimestamp(),
    });
    if (currentUser) {
      const newEntry = {
        title: projectData.title, source: projectData.source || "共有プロジェクト",
        images: projectData.image ? [projectData.image] : [], pdfData: null, color: "#8B9E8F",
        tags: formEntry.tags, answers: formEntry.answers, memo: formEntry.memo || "",
        firstImpression: formEntry.firstImpression || "",
        date: new Date().toLocaleDateString("ja-JP").replace(/\//g, "."),
        projectId, createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, "users", currentUser.uid, "entries"), newEntry);
      // ★ 共有者の詳細画面にも反映されるよう、selectedとentriesを更新
      const addedEntry = { ...newEntry, id: docRef.id };
      setEntries(p => [addedEntry, ...p]);
      setSelected(addedEntry);
    }
    setProjectSubmitted(true);
  };

  const formSheetProps = { closeSheet, saveEntry, sheetMode, fileInputRef, handleImageUpload, urlInput, setUrlInput, fetchingUrl, handleUrlFetch, formEntry, setFormEntry, generatingAI, generateWithAI, aiVersion, aiError, setAiError, firstImpressionRef };
  const FormSheet = () => <FormSheetComponent {...formSheetProps} />;

  if (authLoading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "-apple-system, sans-serif", color: "#8E8E93", fontSize: 15 }}>読み込み中...</div>;

  // 共同プロジェクトモード
  if (projectId) {
    if (!projectData) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "-apple-system, sans-serif", color: "#8E8E93" }}>読み込み中...</div>;
    return (
      <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif", background: "#F2F2F7", minHeight: "100vh" }}>
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } textarea, input { font-family: inherit; outline: none; } textarea { resize: none; }`}</style>
        <div style={{ background: "rgba(242,242,247,0.92)", backdropFilter: "blur(20px)", borderBottom: "0.5px solid rgba(0,0,0,0.12)", padding: "0 20px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
          <button type="button" onClick={() => window.location.href = window.location.origin} style={{ background: "none", border: "none", color: "#007AFF", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}><span style={{ fontSize: 20 }}>‹</span> ホーム</button>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{projectData.title}</div>
          <div style={{ width: 60 }} />
        </div>
        {projectData.image && (
          <div style={{ height: 240, overflow: "hidden", position: "relative", cursor: "pointer" }} onClick={() => setImagePreview(0)}>
            <img src={projectData.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} referrerPolicy="no-referrer" />
            <div style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 12, padding: "5px 12px", borderRadius: 20, fontWeight: 500 }}>全画面で見る</div>
          </div>
        )}
        {imagePreview !== null && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }} onClick={() => setImagePreview(null)}>
            <img src={projectData.image} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} referrerPolicy="no-referrer" />
            <button type="button" onClick={() => setImagePreview(null)} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", fontSize: 20, width: 40, height: 40, borderRadius: 99, cursor: "pointer" }}>×</button>
          </div>
        )}
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px" }}>
          {projectData.url && <div style={{ marginBottom: 16 }}><a href={projectData.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#007AFF", background: "#fff", padding: "8px 16px", borderRadius: 20, textDecoration: "none", fontWeight: 500, display: "inline-block" }}>元のページを見る →</a></div>}
          {!userNameSet ? (
            <div style={{ background: "#fff", borderRadius: 16, padding: "28px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>参加する</div>
              <div style={{ fontSize: 15, color: "#8E8E93", marginBottom: 24 }}>あなたの名前を入力して解剖を始めよう</div>
              <input value={userName} onChange={e => setUserName(e.target.value)} placeholder="名前" style={{ width: "100%", padding: "14px 16px", fontSize: 16, border: "1px solid #E5E5EA", borderRadius: 12, marginBottom: 16, background: "#F2F2F7" }} />
              <button type="button" onClick={() => userName && setUserNameSet(true)} style={{ width: "100%", background: "#007AFF", color: "#fff", border: "none", padding: "14px", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>始める</button>
            </div>
          ) : projectSubmitted ? (
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>みんなの解剖</div>
              <div style={{ fontSize: 15, color: "#8E8E93", marginBottom: 20 }}>{projectEntries.length}人が参加</div>
              {projectData.ownerAnswers && (
                <div style={{ background: "#fff", borderRadius: 14, padding: "16px 18px", marginBottom: 12, borderLeft: "3px solid #007AFF" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#007AFF", marginBottom: 10 }}>共有者の考察</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
                    {(projectData.ownerTags || []).map(tag => <span key={tag} style={{ fontSize: 11, background: "#F2F2F7", color: "#3C3C43", padding: "3px 9px", borderRadius: 20, fontWeight: 500 }}>{tag}</span>)}
                  </div>
                  {QUESTIONS.map(q => projectData.ownerAnswers?.[q.id] && (
                    <div key={q.id} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{q.label}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.6 }}>{projectData.ownerAnswers[q.id]}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {projectEntries.map(entry => (
                  <div key={entry.id} style={{ background: "#fff", borderRadius: 16, padding: "18px 20px" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: "#007AFF" }}>{entry.userName}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                      {(entry.tags || []).map(tag => <span key={tag} style={{ fontSize: 12, background: "#F2F2F7", color: "#3C3C43", padding: "3px 10px", borderRadius: 20, fontWeight: 500 }}>{tag}</span>)}
                    </div>
                    {QUESTIONS.map(q => entry.answers?.[q.id] && (
                      <div key={q.id} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{q.label}</div>
                        <div style={{ fontSize: 14, lineHeight: 1.6 }}>{entry.answers[q.id]}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>解剖する</div>
              <div style={{ fontSize: 15, color: "#8E8E93", marginBottom: 20 }}>{userName} として参加中</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>惹かれた要素</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {TAGS.map(tag => <button type="button" key={tag} onClick={() => toggleTag(tag)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, background: formEntry.tags.includes(tag) ? "#007AFF" : "#F2F2F7", color: formEntry.tags.includes(tag) ? "#fff" : "#3C3C43", border: "none", cursor: "pointer", fontFamily: "inherit" }}>{tag}</button>)}
                  </div>
                </div>
                <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden" }}>
                  {QUESTIONS.map((q, i) => (
                    <div key={q.id} style={{ borderBottom: i < QUESTIONS.length - 1 ? "0.5px solid #E5E5EA" : "none", padding: "14px 16px" }}>
                      <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{String(i + 1).padStart(2, "0")} · {q.label}</div>
                      <textarea value={formEntry.answers[q.id]} onChange={e => setFormEntry(p => ({ ...p, answers: { ...p.answers, [q.id]: e.target.value } }))} rows={2} placeholder={q.placeholder} style={{ width: "100%", border: "none", fontSize: 15, background: "transparent", lineHeight: 1.5, fontFamily: "inherit", resize: "none" }} />
                    </div>
                  ))}
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>その他 · メモ</div>
                    <textarea value={formEntry.memo || ""} onChange={e => setFormEntry(p => ({ ...p, memo: e.target.value }))} rows={2} placeholder="上記以外で気になったこと" style={{ width: "100%", border: "none", fontSize: 15, background: "transparent", lineHeight: 1.5, fontFamily: "inherit", resize: "none" }} />
                  </div>
                </div>
                <button type="button" onClick={submitProjectEntry} style={{ background: "#007AFF", color: "#fff", border: "none", padding: "16px", borderRadius: 14, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>解剖を投稿する</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 未ログイン時
  if (!currentUser) {
    return (
      <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", background: "#F2F2F7", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: "40px 28px", width: "100%", maxWidth: 400 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔬</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>なおす</div>
            <div style={{ fontSize: 14, color: "#8E8E93" }}>嫉妬を、図鑑にする。</div>
          </div>
          <div style={{ display: "flex", background: "#F2F2F7", borderRadius: 10, padding: 3, marginBottom: 24 }}>
            {(["login", "signup"] as const).map(mode => (
              <button type="button" key={mode} onClick={() => { setAuthMode(mode); setAuthError(""); }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: authMode === mode ? "#fff" : "transparent", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit", boxShadow: authMode === mode ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
                {mode === "login" ? "ログイン" : "新規登録"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            <input value={authEmail} onChange={e => setAuthEmail(e.target.value)} type="email" placeholder="メールアドレス" style={{ padding: "14px 16px", borderRadius: 12, border: "1px solid #E5E5EA", fontSize: 15, fontFamily: "inherit", outline: "none", background: "#F2F2F7" }} />
            <input value={authPassword} onChange={e => setAuthPassword(e.target.value)} type="password" placeholder="パスワード（6文字以上）" onKeyDown={e => e.key === "Enter" && handleAuth()} style={{ padding: "14px 16px", borderRadius: 12, border: "1px solid #E5E5EA", fontSize: 15, fontFamily: "inherit", outline: "none", background: "#F2F2F7" }} />
          </div>
          {authError && <div style={{ background: "#FFF3CD", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#856404", marginBottom: 16 }}>{authError}</div>}
          <button type="button" onClick={handleAuth} disabled={authSubmitting || !authEmail || !authPassword} style={{ width: "100%", background: "#007AFF", color: "#fff", border: "none", padding: "16px", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: authSubmitting ? 0.7 : 1 }}>
            {authSubmitting ? "処理中..." : authMode === "login" ? "ログイン" : "アカウントを作成"}
          </button>
        </div>
      </div>
    );
  }

  // 個人モード
  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif", background: "#F2F2F7", minHeight: "100vh", color: "#000" }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } ::-webkit-scrollbar { width: 0; } .card { transition: transform 0.18s ease, box-shadow 0.18s ease; cursor: pointer; } .card:hover { transform: scale(1.02); box-shadow: 0 8px 24px rgba(0,0,0,0.12); } .sf-btn { cursor: pointer; transition: opacity 0.15s; border: none; } .sf-btn:hover { opacity: 0.75; } .seg-btn { cursor: pointer; transition: all 0.2s; border: none; }`}</style>

      {/* Nav */}
      <div style={{ background: "rgba(242,242,247,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "0.5px solid rgba(0,0,0,0.12)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 20px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {view === "detail" ? (
            <button type="button" onClick={() => setView("home")} style={{ background: "none", border: "none", color: "#007AFF", fontSize: 17, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: "inherit", padding: "10px 10px 10px 0", margin: "-10px 0" }}>
              <span style={{ fontSize: 20 }}>‹</span> Library
            </button>
          ) : (
            <button type="button" onClick={() => setSettingProfile(true)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: 99, background: "#E5E5EA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{userProfile?.icon || "🎨"}</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{userProfile?.name || "Library"}</div>
            </button>
          )}
          {view === "detail" ? (
            <div style={{ display: "flex", gap: 16 }}>
              <button className="sf-btn" onClick={() => shareProject(selected)} style={{ background: "none", color: "#007AFF", fontSize: 15 }}>共有</button>
              <button className="sf-btn" onClick={() => openEdit(selected)} style={{ background: "none", color: "#007AFF", fontSize: 15 }}>編集</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button className="sf-btn" onClick={openCreate} style={{ background: "none", color: "#007AFF", fontSize: 28, lineHeight: 1, fontWeight: 300 }}>+</button>
            </div>
          )}
        </div>
        {view !== "detail" && (
          <div style={{ maxWidth: 960, margin: "0 auto", padding: "8px 20px 10px" }}>
            <div style={{ display: "inline-flex", background: "rgba(118,118,128,0.12)", borderRadius: 9, padding: 2 }}>
              {[["home", "Collection"], ["map", "Insight"]].map(([v, label]) => (
                <button type="button" key={v} className="seg-btn" onClick={() => setView(v)} style={{ padding: "5px 18px", borderRadius: 7, fontSize: 13, fontWeight: 500, background: view === v ? "#fff" : "transparent", color: view === v ? "#000" : "#666", boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>{label}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Home */}
      {view === "home" && (
        <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px" }}>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.5px", marginBottom: 20 }}>Collection</div>
          {entries.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔬</div>
              <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>良いなと思ったら、今すぐ解剖しよう</div>
              <div style={{ fontSize: 15, color: "#8E8E93", marginBottom: 24 }}>作品を解剖して自分だけの図鑑をつくる</div>
              <button type="button" onClick={openCreate} style={{ background: "#007AFF", color: "#fff", border: "none", padding: "12px 28px", borderRadius: 99, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>最初の解剖をはじめる</button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {entries.map(entry => {
                const imgs = entry.images || (entry.image ? [entry.image] : []);
                return (
                  <div key={entry.id} className="card" onClick={() => openDetail(entry)} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", position: "relative" }}>
                    <div style={{ height: 150, background: entry.color || "#C8C8C8", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                      {imgs[0] ? <img src={imgs[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} referrerPolicy="no-referrer" /> : null}
                      {imgs.length > 1 && <div style={{ position: "absolute", bottom: 6, right: 8, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 11, padding: "2px 8px", borderRadius: 20 }}>+{imgs.length - 1}</div>}
                    </div>
                    <button type="button" onClick={(e) => deleteEntry(entry.id, e)} style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: 99, background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    <div style={{ padding: "14px 16px 16px" }}>
                      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.title}</div>
                      <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 12 }}>{entry.source} · {entry.date}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {(entry.tags || []).slice(0, 3).map(tag => <span key={tag} style={{ fontSize: 11, background: "#F2F2F7", color: "#3C3C43", padding: "3px 9px", borderRadius: 20, fontWeight: 500 }}>{tag}</span>)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* Detail */}
      {view === "detail" && selected && (() => {
        const imgs = selected.images || (selected.image ? [selected.image] : []);
        return (
          <main style={{ maxWidth: 720, margin: "0 auto", padding: "0 0 48px" }}>
            {/* ★ 複数枚画像スライド */}
            {imgs.length > 0 && (
              <div style={{ position: "relative" }}>
                <div style={{ height: 280, background: selected.color || "#C8C8C8", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} onClick={() => setImagePreview(0)}>
                  <img src={imgs[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} referrerPolicy="no-referrer" />
                  <div style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 12, padding: "5px 12px", borderRadius: 20, fontWeight: 500 }}>全画面で見る</div>
                </div>
                {imgs.length > 1 && (
                  <div style={{ display: "flex", gap: 6, padding: "10px 20px", overflowX: "auto" }}>
                    {imgs.map((img, i) => (
                      <img key={i} src={img} alt="" onClick={() => setImagePreview(i)} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, cursor: "pointer", flexShrink: 0, opacity: 0.8 }} referrerPolicy="no-referrer" />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 全画面プレビュー */}
            {imagePreview !== null && imgs[imagePreview] && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }} onClick={() => setImagePreview(null)}>
                <img src={imgs[imagePreview]} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} referrerPolicy="no-referrer" />
                {imgs.length > 1 && imagePreview > 0 && <button type="button" onClick={e => { e.stopPropagation(); setImagePreview(imagePreview - 1); }} style={{ position: "absolute", left: 20, background: "rgba(255,255,255,0.2)", color: "#fff", border: "none", fontSize: 24, width: 44, height: 44, borderRadius: 99, cursor: "pointer" }}>‹</button>}
                {imgs.length > 1 && imagePreview < imgs.length - 1 && <button type="button" onClick={e => { e.stopPropagation(); setImagePreview(imagePreview + 1); }} style={{ position: "absolute", right: 20, background: "rgba(255,255,255,0.2)", color: "#fff", border: "none", fontSize: 24, width: 44, height: 44, borderRadius: 99, cursor: "pointer" }}>›</button>}
                <button type="button" onClick={() => setImagePreview(null)} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", fontSize: 20, width: 40, height: 40, borderRadius: 99, cursor: "pointer" }}>×</button>
                <div style={{ position: "absolute", bottom: 20, color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{imagePreview + 1} / {imgs.length}</div>
              </div>
            )}

            <div style={{ padding: "24px 20px" }}>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.3px", marginBottom: 4 }}>{selected.title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 15, color: "#8E8E93" }}>{selected.source} · {selected.date}</span>
                {selected.url && <a href={selected.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#007AFF", background: "#F2F2F7", padding: "3px 10px", borderRadius: 20, textDecoration: "none", fontWeight: 500 }}>元のページ →</a>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
                {(selected.tags || []).map(tag => <span key={tag} style={{ fontSize: 13, background: "#E5E5EA", color: "#3C3C43", padding: "4px 12px", borderRadius: 20, fontWeight: 500 }}>{tag}</span>)}
              </div>

              {/* ★ フェーズ表示 */}
              {selected.phase && (() => {
                const p = PHASES.find(p => p.id === selected.phase);
                return p ? (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: p.color + "18", border: `1.5px solid ${p.color}`, borderRadius: 12, padding: "8px 14px", marginBottom: 20 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 99, background: p.color }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: p.color }}>{p.label}</span>
                    <span style={{ fontSize: 12, color: "#8E8E93" }}>のフェーズが面白い</span>
                  </div>
                ) : null;
              })()}

              {/* ★ 第一印象を詳細画面にも表示 */}
              {selected.firstImpression && (
                <div style={{ background: "#fff", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>💬 なぜ良いと思った？</div>
                  <div style={{ fontSize: 15, lineHeight: 1.7, color: "#000" }}>{selected.firstImpression}</div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {QUESTIONS.map((q, i) => (
                  <div key={q.id} style={{ background: "#fff", borderRadius: i === 0 ? "12px 12px 2px 2px" : 2, padding: "16px 18px", marginBottom: 1 }}>
                    <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 500, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{String(i + 1).padStart(2, "0")} · {q.label}</div>
                    <div style={{ fontSize: 15, lineHeight: 1.7, color: selected.answers?.[q.id] ? "#000" : "#C7C7CC" }}>{selected.answers?.[q.id] || "—"}</div>
                  </div>
                ))}
                <div style={{ background: "#fff", borderRadius: "2px 2px 12px 12px", padding: "16px 18px" }}>
                  <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 500, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>その他 · メモ</div>
                  <div style={{ fontSize: 15, lineHeight: 1.7, color: selected.memo ? "#000" : "#C7C7CC" }}>{selected.memo || "—"}</div>
                </div>
              </div>

              {/* みんなの解剖 */}
              {selected.projectId && (
                <div style={{ marginTop: 32 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ fontSize: 17, fontWeight: 600 }}>みんなの解剖</div>
                    <span style={{ fontSize: 13, color: "#8E8E93" }}>{sharedEntries.length}件</span>
                  </div>
                  {sharedEntries.length === 0 ? (
                    <div style={{ background: "#fff", borderRadius: 12, padding: "20px", textAlign: "center", color: "#8E8E93", fontSize: 14 }}>まだ誰も解剖していない</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {sharedEntries.map(entry => (
                        <div key={entry.id} style={{ background: "#fff", borderRadius: 14, padding: "16px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 99, background: "#E5E5EA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{entry.userIcon || "🎨"}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#007AFF" }}>{entry.userName}</div>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
                            {(entry.tags || []).map(tag => <span key={tag} style={{ fontSize: 11, background: "#F2F2F7", color: "#3C3C43", padding: "3px 9px", borderRadius: 20, fontWeight: 500 }}>{tag}</span>)}
                          </div>
                          {QUESTIONS.map(q => entry.answers?.[q.id] && (
                            <div key={q.id} style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 11, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{q.label}</div>
                              <div style={{ fontSize: 13, lineHeight: 1.6 }}>{entry.answers[q.id]}</div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>
        );
      })()}

      {/* Insight */}
      {view === "map" && (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px" }}>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.5px", marginBottom: 24 }}>Insight</div>

          {/* ★ 審美眼診断：常時表示 */}
          <div style={{ background: "#fff", borderRadius: 16, padding: "20px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>今のあなたの審美眼</div>
            {entries.length < 5 ? (
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🌱</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>あと{5 - entries.length}作品で診断できます</div>
                <div style={{ fontSize: 12, color: "#8E8E93" }}>解剖を重ねるほど精度が上がります</div>
              </div>
            ) : diagnosisLoading ? (
              <div style={{ fontSize: 14, color: "#8E8E93", padding: "8px 0" }}>診断中...</div>
            ) : diagnosis ? (
              <div style={{ fontSize: 16, lineHeight: 1.8, color: "#111", fontWeight: 500 }}>{diagnosis}</div>
            ) : null}
          </div>
          <div style={{ background: "#fff", borderRadius: 16, padding: "20px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 18 }}>反応するフェーズ</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {PHASES.map(phase => {
                const count = entries.filter(e => e.phase === phase.id).length;
                const pct = entries.length > 0 ? (count / entries.length) * 100 : 0;
                return (
                  <div key={phase.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{phase.label}</span>
                      <span style={{ fontSize: 13, color: "#8E8E93" }}>{count}</span>
                    </div>
                    <div style={{ height: 6, background: "#F2F2F7", borderRadius: 99 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: phase.color, borderRadius: 99, transition: "width 0.4s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* タグ分布（タップで絞り込み） */}
          <div style={{ background: "#fff", borderRadius: 16, padding: "20px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>よく反応する要素</div>
            <div style={{ fontSize: 11, color: "#C7C7CC", marginBottom: 16 }}>タップするとその作品を見られます</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Object.entries(tagCounts).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([tag, count]) => (
                <div key={tag} onClick={() => { setInsightTag(insightTag === tag ? null : tag); }} style={{ cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: insightTag === tag ? "#007AFF" : "#000" }}>{tag}</span>
                    <span style={{ fontSize: 13, color: "#8E8E93" }}>{count as number}</span>
                  </div>
                  <div style={{ height: 4, background: "#F2F2F7", borderRadius: 99 }}>
                    <div style={{ height: "100%", width: `${((count as number) / maxCount) * 100}%`, background: insightTag === tag ? "#007AFF" : "#C7C7CC", borderRadius: 99, transition: "all 0.3s" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ★ タグ絞り込み結果 */}
          {insightTag && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>「{insightTag}」に反応した作品</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {entries.filter(e => (e.tags || []).includes(insightTag)).map(entry => {
                  const imgs = entry.images || (entry.image ? [entry.image] : []);
                  const phase = PHASES.find(p => p.id === entry.phase);
                  return (
                    <div key={entry.id} onClick={() => { openDetail(entry); setInsightTag(null); }} style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", display: "flex", gap: 14, alignItems: "center", cursor: "pointer" }}>
                      {imgs[0] && <img src={imgs[0]} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, flexShrink: 0 }} referrerPolicy="no-referrer" />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.title}</div>
                        <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 6 }}>{entry.source} · {entry.date}</div>
                        {phase && <span style={{ fontSize: 11, fontWeight: 600, color: phase.color, background: phase.color + "18", padding: "2px 8px", borderRadius: 20 }}>{phase.label}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stats */}
          <div style={{ background: "#fff", borderRadius: 16, padding: "20px" }}>
            <div style={{ fontSize: 13, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Stats</div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1, background: "#F2F2F7", borderRadius: 12, padding: "16px", textAlign: "center" }}>
                <div style={{ fontSize: 34, fontWeight: 700, color: "#007AFF" }}>{entries.length}</div>
                <div style={{ fontSize: 12, color: "#8E8E93", marginTop: 2 }}>解剖した作品</div>
              </div>
              <div style={{ flex: 1, background: "#F2F2F7", borderRadius: 12, padding: "16px", textAlign: "center" }}>
                <div style={{ fontSize: 34, fontWeight: 700, color: "#007AFF" }}>{Object.keys(tagCounts).length}</div>
                <div style={{ fontSize: 12, color: "#8E8E93", marginTop: 2 }}>反応した要素</div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* 共有プロジェクト作成モーダル */}
      {creatingProject && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "#F2F2F7", width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", borderRadius: "20px 20px 0 0", padding: "0 0 32px" }}>
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}><div style={{ width: 36, height: 4, background: "#D1D1D6", borderRadius: 99 }} /></div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px 20px" }}>
              <button type="button" onClick={() => { setCreatingProject(false); setProjectUrl(null); setNewProjectTitle(""); setNewProjectImage(null); setCreatingProjectLoading(false); }} style={{ background: "none", border: "none", color: "#007AFF", fontSize: 17, cursor: "pointer" }}>閉じる</button>
              <div style={{ fontSize: 17, fontWeight: 600 }}>共有プロジェクト</div>
              <div style={{ width: 60 }} />
            </div>
            {projectUrl ? (
              <div style={{ padding: "0 20px", textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>プロジェクト作成完了</div>
                <div style={{ fontSize: 15, color: "#8E8E93", marginBottom: 24 }}>このURLを共有して一緒に解剖しよう</div>
                <div style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 16, wordBreak: "break-all", fontSize: 13, color: "#007AFF" }}>{projectUrl}</div>
                <button type="button" onClick={() => navigator.clipboard.writeText(projectUrl)} style={{ width: "100%", background: "#007AFF", color: "#fff", border: "none", padding: "14px", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>URLをコピー</button>
              </div>
            ) : (
              <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                <input type="file" accept="image/*" ref={projectFileRef} onChange={handleProjectImageUpload} style={{ display: "none" }} />
                {newProjectImage ? (
                  <div style={{ position: "relative", height: 180, borderRadius: 14, overflow: "hidden" }}>
                    <img src={newProjectImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button type="button" onClick={() => setNewProjectImage(null)} style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.55)", color: "#fff", border: "none", fontSize: 12, padding: "5px 12px", borderRadius: 20, cursor: "pointer" }}>削除</button>
                  </div>
                ) : (
                  <div onClick={() => projectFileRef.current.click()} style={{ height: 100, background: "#fff", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}>
                    <span style={{ fontSize: 20, color: "#007AFF" }}>↑</span>
                    <div style={{ fontSize: 13, color: "#8E8E93" }}>解剖する作品の画像</div>
                  </div>
                )}
                <div style={{ background: "#fff", borderRadius: 14 }}>
                  <input value={newProjectTitle} onChange={e => setNewProjectTitle(e.target.value)} placeholder="作品タイトル" style={{ display: "block", width: "100%", padding: "14px 16px", fontSize: 15, border: "none", background: "transparent", fontFamily: "inherit", outline: "none", borderRadius: 14 }} />
                </div>
                <button type="button" onClick={createProject} disabled={creatingProjectLoading || !newProjectTitle} style={{ background: creatingProjectLoading ? "#E5E5EA" : "#007AFF", color: creatingProjectLoading ? "#8E8E93" : "#fff", border: "none", padding: "16px", borderRadius: 14, fontSize: 16, fontWeight: 600, cursor: creatingProjectLoading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {creatingProjectLoading ? "作成中..." : "プロジェクトを作成してURLを発行"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {sheetMode && <FormSheet />}

      {/* プロフィール設定 */}
      {(!userProfile || settingProfile) && (
        <div style={{ position: "fixed", inset: 0, background: settingProfile ? "rgba(0,0,0,0.4)" : "#F2F2F7", display: "flex", alignItems: settingProfile ? "flex-end" : "center", justifyContent: "center", zIndex: 300 }}>
          <div style={{ background: "#F2F2F7", width: "100%", maxWidth: 480, borderRadius: settingProfile ? "20px 20px 0 0" : 24, padding: "32px 24px 40px" }}>
            {settingProfile && <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><div style={{ width: 36, height: 4, background: "#D1D1D6", borderRadius: 99 }} /></div>}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ width: 64, height: 64, borderRadius: 99, background: "#E5E5EA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 16px" }}>{profileForm.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{settingProfile ? "プロフィール編集" : "はじめまして"}</div>
              {!settingProfile && <div style={{ fontSize: 15, color: "#8E8E93" }}>名前とアイコンを設定しよう</div>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 20 }}>
              {ICONS.map(icon => <button type="button" key={icon} onClick={() => setProfileForm(p => ({ ...p, icon }))} style={{ width: 44, height: 44, borderRadius: 12, background: profileForm.icon === icon ? "#007AFF" : "#fff", fontSize: 22, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</button>)}
            </div>
            <div style={{ background: "#fff", borderRadius: 14, marginBottom: 16 }}>
              <input value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} placeholder="名前を入力" style={{ display: "block", width: "100%", padding: "14px 16px", fontSize: 16, border: "none", background: "transparent", fontFamily: "inherit", outline: "none", borderRadius: 14 }} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {settingProfile && <button type="button" onClick={() => setSettingProfile(false)} style={{ flex: 1, background: "#E5E5EA", color: "#000", border: "none", padding: "14px", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>キャンセル</button>}
              <button type="button" onClick={() => { if (!profileForm.name) return; const p = { name: profileForm.name, icon: profileForm.icon }; localStorage.setItem("naosu-profile", JSON.stringify(p)); setUserProfile(p); setSettingProfile(false); }} style={{ flex: 1, background: "#007AFF", color: "#fff", border: "none", padding: "14px", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{settingProfile ? "保存" : "始める"}</button>
            </div>
            {settingProfile && (
              <button type="button" onClick={() => signOut(auth)} style={{ width: "100%", background: "none", border: "none", color: "#FF3B30", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", marginTop: 16, padding: "10px 0" }}>ログアウト</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
