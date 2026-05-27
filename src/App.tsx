import { useState, useRef, useEffect } from "react";
import { db } from "./firebase";
import { collection, addDoc, onSnapshot, doc, getDoc, serverTimestamp } from "firebase/firestore";

const ICONS = ["🎨","🖌️","✏️","📐","💡","🔍","🌸","🌙","⭐","🔥","💫","🌊","🦋","🌿","🎯","🦄","🐼","🐸","🦊","🐱"];

const TAGS = ["タイポグラフィ", "余白", "配色", "レイアウト", "世界観", "構成", "テクスチャ", "グリッド", "コンセプト", "視線誘導", "テーマの面白さ", "課題解決の仕方"];
const QUESTIONS = [
  { id: "q1", label: "どこに惹かれた？", placeholder: "最初に目が止まった場所" },
  { id: "q2", label: "作者の視点の仮説", placeholder: "どんな意図で作ったんだろう" },
  { id: "q3", label: "このデザインが解いている課題・テーマの仮説", placeholder: "どんな問いや目的があって作られたんだろう" },
  { id: "q4", label: "自分の作品に持ち込めること", placeholder: "具体的に学べること" },
];
const EMPTY_ENTRY = { title: "", source: "", image: null, pdfData: null, color: "#C8C8C8", tags: [], answers: { q1: "", q2: "", q3: "", q4: "" }, memo: "" };
const DEMO_ENTRIES = [
  { id: 1, title: "MUJI 2024 Annual Report", source: "Behance", image: "https://images.unsplash.com/photo-1600132806370-bf17e65e942f?w=600&q=80", pdfData: null, color: "#D4C9B4", tags: ["余白", "タイポグラフィ", "グリッド"], date: "2024.11.03", memo: "", answers: { q1: "余白の使い方が異常に贅沢。テキストが呼吸している感じ", q2: "情報を「削る」ことに確信を持っている", q3: "自分なら不安で情報を詰めすぎてた", q4: "1ページに要素を3つまでに絞る練習をする" } },
  { id: 2, title: "同期のポートフォリオ", source: "re:designer", image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&q=80", pdfData: null, color: "#8B9E8F", tags: ["世界観", "配色", "レイアウト"], date: "2024.11.12", memo: "", answers: { q1: "全ページに一貫した「暗さ」がある", q2: "好きなものが明確で、それ以外を全部捨ててる", q3: "自分は万人受けを意識して丸くなってた", q4: "自分の「嫌いなもの」リストを作ってみる" } },
  { id: 3, title: "Nike × Wieden+Kennedy", source: "Pinterest", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80", pdfData: null, color: "#2D2D2D", tags: ["タイポグラフィ", "構成", "世界観"], date: "2024.11.18", memo: "", answers: { q1: "文字が主役になっている", q2: "タイポグラフィを「イラスト」として扱っている", q3: "文字を読ませようとしてた", q4: "テキストオンリーのビジュアル制作を週1回やる" } },
];

export default function App() {
  // URLからprojectIdを取得
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get("project");

  // プロフィール
  const [userProfile, setUserProfile] = useState(() => {
    try { const s = localStorage.getItem("naosu-profile"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [settingProfile, setSettingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", icon: "🎨" });

  // 個人モードのstate
  const [view, setView] = useState("home");
  const [entries, setEntries] = useState(() => {
    try { const s = localStorage.getItem("naosu-entries"); return s ? JSON.parse(s) : DEMO_ENTRIES; } catch { return DEMO_ENTRIES; }
  });
  useEffect(() => { try { localStorage.setItem("naosu-entries", JSON.stringify(entries)); } catch {} }, [entries]);
  const [selected, setSelected] = useState(null);
  const [sheetMode, setSheetMode] = useState(null);
  const [formEntry, setFormEntry] = useState(EMPTY_ENTRY);
  const [imagePreview, setImagePreview] = useState(false);
  const [sharedEntries, setSharedEntries] = useState([]);
  const fileInputRef = useRef(null);

  // 詳細画面の共有エントリーをリアルタイム取得
  useEffect(() => {
    if (!selected?.projectId) { setSharedEntries([]); return; }
    const unsub = onSnapshot(collection(db, "projects", selected.projectId, "entries"), (snap) => {
      setSharedEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selected?.projectId]);

  // 共同プロジェクトのstate
  const [projectData, setProjectData] = useState(null);
  const [projectEntries, setProjectEntries] = useState([]);
  const [userName, setUserName] = useState("");
  const [userNameSet, setUserNameSet] = useState(false);
  const [projectSubmitted, setProjectSubmitted] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectImage, setNewProjectImage] = useState(null);
  const [projectUrl, setProjectUrl] = useState(null);
  const projectFileRef = useRef(null);

  // 共同プロジェクトデータを取得
  useEffect(() => {
    if (!projectId) return;
    const fetchProject = async () => {
      const docRef = doc(db, "projects", projectId);
      const snap = await getDoc(docRef);
      if (snap.exists()) setProjectData(snap.data());
    };
    fetchProject();
    const unsub = onSnapshot(collection(db, "projects", projectId, "entries"), (snap) => {
      setProjectEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [projectId]);

  // プロフィールがあれば共有プロジェクトの名前を自動設定
  useEffect(() => {
    if (userProfile && projectId) {
      setUserName(userProfile.name);
      setUserNameSet(true);
    }
  }, [userProfile, projectId]);

  const tagCounts = {};
  entries.forEach(e => e.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const maxCount = Math.max(...Object.values(tagCounts), 1);

  const toggleTag = (tag) => setFormEntry(p => ({ ...p, tags: p.tags.includes(tag) ? p.tags.filter(t => t !== tag) : [...p.tags, tag] }));

  const handleImageUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    if (file.type === "application/pdf") {
      reader.onload = (ev) => setFormEntry(p => ({ ...p, image: "pdf", pdfData: ev.target.result }));
    } else {
      reader.onload = (ev) => setFormEntry(p => ({ ...p, image: ev.target.result, pdfData: null }));
    }
    reader.readAsDataURL(file);
  };

  const handleProjectImageUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setNewProjectImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  const openCreate = () => { setFormEntry(EMPTY_ENTRY); setSheetMode("create"); };
  const openEdit = (entry) => { setFormEntry({ ...entry }); setSheetMode("edit"); };
  const closeSheet = () => { setSheetMode(null); setFormEntry(EMPTY_ENTRY); };

  const saveEntry = () => {
    if (!formEntry.title) return;
    if (sheetMode === "create") {
      setEntries(p => [...p, { ...formEntry, id: Date.now(), date: new Date().toLocaleDateString("ja-JP").replace(/\//g, ".") }]);
    } else {
      setEntries(p => p.map(e => e.id === formEntry.id ? { ...formEntry } : e));
      setSelected({ ...formEntry });
    }
    closeSheet();
  };

  const deleteEntry = (id, e) => { e.stopPropagation(); setEntries(p => p.filter(en => en.id !== id)); };

  const shareProject = async (entry) => {
    const docRef = await addDoc(collection(db, "projects"), {
      title: entry.title,
      image: entry.image === "pdf" ? null : entry.image,
      source: entry.source,
      ownerAnswers: entry.answers,
      ownerTags: entry.tags,
      ownerMemo: entry.memo || "",
      createdAt: serverTimestamp(),
    });
    const pid = docRef.id;
    setEntries(p => p.map(e => e.id === entry.id ? { ...e, projectId: pid } : e));
    setSelected(s => s ? { ...s, projectId: pid } : s);
    const url = `${window.location.origin}/?project=${pid}`;
    setProjectUrl(url);
    setCreatingProject(true);
  };
  const openDetail = (entry) => { setSelected(entry); setView("detail"); };

  // 共同プロジェクト作成
  const createProject = async () => {
    if (!newProjectTitle) return;
    const docRef = await addDoc(collection(db, "projects"), {
      title: newProjectTitle,
      image: newProjectImage,
      createdAt: serverTimestamp(),
    });
    const url = `${window.location.origin}/?project=${docRef.id}`;
    setProjectUrl(url);
  };

  // 共同プロジェクトに解剖を投稿
  const submitProjectEntry = async () => {
    if (!userName || !projectId) return;
    const answers = {};
    QUESTIONS.forEach(q => { answers[q.id] = formEntry.answers[q.id] || ""; });
    await addDoc(collection(db, "projects", projectId, "entries"), {
      userName,
      userIcon: userProfile?.icon || "🎨",
      tags: formEntry.tags,
      answers,
      memo: formEntry.memo || "",
      createdAt: serverTimestamp(),
    });
    // 自分のCollectionにも追加
    const newEntry = {
      id: Date.now(),
      title: projectData.title,
      source: projectData.source || "共有プロジェクト",
      image: projectData.image || null,
      pdfData: null,
      color: "#8B9E8F",
      tags: formEntry.tags,
      answers: formEntry.answers,
      memo: formEntry.memo || "",
      date: new Date().toLocaleDateString("ja-JP").replace(/\//g, "."),
      projectId: projectId,
    };
    try {
      const existing = localStorage.getItem("naosu-entries");
      const existingEntries = existing ? JSON.parse(existing) : [];
      localStorage.setItem("naosu-entries", JSON.stringify([...existingEntries, newEntry]));
    } catch {}
    setProjectSubmitted(true);
  };

  const inputStyle = { display: "block", width: "100%", padding: "14px 16px", fontSize: 15, border: "none", background: "transparent", fontFamily: "inherit", outline: "none" };

  const FormSheet = () => (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: "#F2F2F7", width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", borderRadius: "20px 20px 0 0", padding: "0 0 32px" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, background: "#D1D1D6", borderRadius: 99 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px 20px" }}>
          <button onClick={closeSheet} style={{ background: "none", border: "none", color: "#007AFF", fontSize: 17, cursor: "pointer" }}>キャンセル</button>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{sheetMode === "edit" ? "編集" : "新しい解剖"}</div>
          <button onClick={saveEntry} style={{ background: "none", border: "none", color: "#007AFF", fontSize: 17, fontWeight: 600, cursor: "pointer" }}>保存</button>
        </div>
        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="file" accept="image/*,.pdf" ref={fileInputRef} onChange={handleImageUpload} style={{ display: "none" }} />
          {formEntry.image ? (
            <div style={{ position: "relative", height: 180, borderRadius: 14, overflow: "hidden", background: formEntry.image === "pdf" ? "#2D2D2D" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {formEntry.image === "pdf" ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <svg width="48" height="60" viewBox="0 0 48 60" fill="none"><rect width="48" height="60" rx="6" fill="white" fillOpacity="0.2"/><path d="M8 4h24l12 12v40H8V4z" fill="white" fillOpacity="0.9"/><path d="M32 4l12 12H32V4z" fill="white" fillOpacity="0.5"/><text x="24" y="42" textAnchor="middle" fill="#C44B2B" fontSize="10" fontWeight="bold">PDF</text></svg>
                  <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>PDFを追加済み</span>
                </div>
              ) : (
                <img src={formEntry.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )}
              <button onClick={() => setFormEntry(p => ({ ...p, image: null, pdfData: null }))} style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.55)", color: "#fff", border: "none", fontSize: 12, padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontWeight: 500 }}>削除</button>
            </div>
          ) : (
            <div onClick={() => fileInputRef.current.click()} style={{ height: 100, background: "#fff", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}>
              <div style={{ width: 36, height: 36, borderRadius: 99, background: "#F2F2F7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 20, color: "#007AFF" }}>↑</span>
              </div>
              <div style={{ fontSize: 13, color: "#8E8E93" }}>画像またはPDFを追加</div>
            </div>
          )}
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden" }}>
            <input value={formEntry.title} onChange={e => setFormEntry(p => ({ ...p, title: e.target.value }))} placeholder="作品名" style={{ ...inputStyle, borderBottom: "0.5px solid #E5E5EA" }} />
            <input value={formEntry.source} onChange={e => setFormEntry(p => ({ ...p, source: e.target.value }))} placeholder="どこで見た？（re:designer, Behance...）" style={inputStyle} />
          </div>
          <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>惹かれた要素</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {TAGS.map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, background: formEntry.tags.includes(tag) ? "#007AFF" : "#F2F2F7", color: formEntry.tags.includes(tag) ? "#fff" : "#3C3C43", border: "none", cursor: "pointer", fontFamily: "inherit" }}>{tag}</button>
              ))}
            </div>
          </div>
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden" }}>
            {QUESTIONS.map((q, i) => (
              <div key={q.id} style={{ borderBottom: "0.5px solid #E5E5EA", padding: "14px 16px" }}>
                <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{String(i + 1).padStart(2, "0")} · {q.label}</div>
                <textarea value={formEntry.answers[q.id]} onChange={e => setFormEntry(p => ({ ...p, answers: { ...p.answers, [q.id]: e.target.value } }))} rows={2} placeholder={q.placeholder} style={{ width: "100%", border: "none", fontSize: 15, color: "#000", background: "transparent", lineHeight: 1.5, fontFamily: "inherit", resize: "none", outline: "none" }} />
              </div>
            ))}
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>その他 · メモ</div>
              <textarea value={formEntry.memo || ""} onChange={e => setFormEntry(p => ({ ...p, memo: e.target.value }))} rows={3} placeholder="上記以外で気になったこと" style={{ width: "100%", border: "none", fontSize: 15, color: "#000", background: "transparent", lineHeight: 1.5, fontFamily: "inherit", resize: "none", outline: "none" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // 共同プロジェクトモード
  if (projectId) {
    if (!projectData) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "-apple-system, sans-serif", color: "#8E8E93" }}>読み込み中...</div>;

    return (
      <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif", background: "#F2F2F7", minHeight: "100vh" }}>
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } textarea, input { font-family: inherit; outline: none; } textarea { resize: none; }`}</style>

        {/* ヘッダー */}
        <div style={{ background: "rgba(242,242,247,0.92)", backdropFilter: "blur(20px)", borderBottom: "0.5px solid rgba(0,0,0,0.12)", padding: "0 20px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
          <button onClick={() => window.location.href = window.location.origin} style={{ background: "none", border: "none", color: "#007AFF", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
            <span style={{ fontSize: 20 }}>‹</span> ホーム
          </button>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{projectData.title}</div>
          <div style={{ width: 60 }} />
        </div>

        {/* 作品画像 */}
        {projectData.image && (
          <div style={{ height: 240, overflow: "hidden" }}>
            <img src={projectData.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}

        <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px" }}>
          {!userNameSet ? (
            // 名前入力
            <div style={{ background: "#fff", borderRadius: 16, padding: "28px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>参加する</div>
              <div style={{ fontSize: 15, color: "#8E8E93", marginBottom: 24 }}>あなたの名前を入力して解剖を始めよう</div>
              <input value={userName} onChange={e => setUserName(e.target.value)} placeholder="名前" style={{ width: "100%", padding: "14px 16px", fontSize: 16, border: "1px solid #E5E5EA", borderRadius: 12, marginBottom: 16, background: "#F2F2F7" }} />
              <button onClick={() => userName && setUserNameSet(true)} style={{ width: "100%", background: "#007AFF", color: "#fff", border: "none", padding: "14px", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>始める</button>
            </div>
          ) : projectSubmitted ? (
            // 投稿完了 → みんなのメモ
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>みんなの解剖</div>
              <div style={{ fontSize: 15, color: "#8E8E93", marginBottom: 20 }}>{projectEntries.length}人が参加</div>
              
              {/* 共有主の考察 */}
              {projectData.ownerAnswers && (
                <div style={{ background: "#fff", borderRadius: 14, padding: "16px 18px", marginBottom: 12, borderLeft: "3px solid #007AFF" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#007AFF", marginBottom: 10 }}>共有者の考察</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
                    {(projectData.ownerTags || []).map(tag => (
                      <span key={tag} style={{ fontSize: 11, background: "#F2F2F7", color: "#3C3C43", padding: "3px 9px", borderRadius: 20, fontWeight: 500 }}>{tag}</span>
                    ))}
                  </div>
                  {QUESTIONS.map(q => projectData.ownerAnswers?.[q.id] && (
                    <div key={q.id} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{q.label}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.6 }}>{projectData.ownerAnswers[q.id]}</div>
                    </div>
                  ))}
                  {projectData.ownerMemo && (
                    <div>
                      <div style={{ fontSize: 11, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>その他メモ</div>
                      <div style={{ fontSize: 13, lineHeight: 1.6 }}>{projectData.ownerMemo}</div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {projectEntries.map(entry => (
                  <div key={entry.id} style={{ background: "#fff", borderRadius: 16, padding: "18px 20px" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: "#007AFF" }}>{entry.userName}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                      {(entry.tags || []).map(tag => (
                        <span key={tag} style={{ fontSize: 12, background: "#F2F2F7", color: "#3C3C43", padding: "3px 10px", borderRadius: 20, fontWeight: 500 }}>{tag}</span>
                      ))}
                    </div>
                    {QUESTIONS.map((q, i) => entry.answers?.[q.id] && (
                      <div key={q.id} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{q.label}</div>
                        <div style={{ fontSize: 14, lineHeight: 1.6 }}>{entry.answers[q.id]}</div>
                      </div>
                    ))}
                    {entry.memo && (
                      <div>
                        <div style={{ fontSize: 11, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>その他メモ</div>
                        <div style={{ fontSize: 14, lineHeight: 1.6 }}>{entry.memo}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // 解剖フォーム
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>解剖する</div>
              <div style={{ fontSize: 15, color: "#8E8E93", marginBottom: 20 }}>{userName} として参加中</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>惹かれた要素</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {TAGS.map(tag => (
                      <button key={tag} onClick={() => toggleTag(tag)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, background: formEntry.tags.includes(tag) ? "#007AFF" : "#F2F2F7", color: formEntry.tags.includes(tag) ? "#fff" : "#3C3C43", border: "none", cursor: "pointer", fontFamily: "inherit" }}>{tag}</button>
                    ))}
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
                <button onClick={submitProjectEntry} style={{ background: "#007AFF", color: "#fff", border: "none", padding: "16px", borderRadius: 14, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>解剖を投稿する</button>
              </div>
            </div>
          )}
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
            <button className="sf-btn" onClick={() => setView("home")} style={{ background: "none", color: "#007AFF", fontSize: 17, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 20 }}>‹</span> Library
            </button>
          ) : (
            <button onClick={() => setSettingProfile(true)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
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
            <button className="sf-btn" onClick={openCreate} style={{ background: "none", color: "#007AFF", fontSize: 28, lineHeight: 1, fontWeight: 300 }}>+</button>
          )}
        </div>
        {view !== "detail" && (
          <div style={{ maxWidth: 960, margin: "0 auto", padding: "8px 20px 10px" }}>
            <div style={{ display: "inline-flex", background: "rgba(118,118,128,0.12)", borderRadius: 9, padding: 2 }}>
              {[["home", "Collection"], ["map", "Insight"]].map(([v, label]) => (
                <button key={v} className="seg-btn" onClick={() => setView(v)} style={{ padding: "5px 18px", borderRadius: 7, fontSize: 13, fontWeight: 500, background: view === v ? "#fff" : "transparent", color: view === v ? "#000" : "#666", boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>{label}</button>
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
              <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>悔しいと感じたら、今すぐ解剖しよう</div>
              <div style={{ fontSize: 15, color: "#8E8E93", marginBottom: 24 }}>作品を解剖して自分だけの図鑑をつくる</div>
              <button onClick={openCreate} style={{ background: "#007AFF", color: "#fff", border: "none", padding: "12px 28px", borderRadius: 99, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>最初の解剖をはじめる</button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {entries.map(entry => (
                <div key={entry.id} className="card" onClick={() => openDetail(entry)} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", position: "relative" }}>
                  <div style={{ height: 150, background: entry.color, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {entry.image === "pdf" ? (
                      <svg width="40" height="50" viewBox="0 0 48 60" fill="none"><rect width="48" height="60" rx="6" fill="white" fillOpacity="0.3"/><path d="M8 4h24l12 12v40H8V4z" fill="white" fillOpacity="0.9"/><path d="M32 4l12 12H32V4z" fill="white" fillOpacity="0.5"/><text x="24" y="42" textAnchor="middle" fill="#C44B2B" fontSize="10" fontWeight="bold">PDF</text></svg>
                    ) : entry.image ? (
                      <img src={entry.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : null}
                  </div>
                  <button onClick={(e) => deleteEntry(entry.id, e)} style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: 99, background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  <div style={{ padding: "14px 16px 16px" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.title}</div>
                    <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 12 }}>{entry.source} · {entry.date}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {entry.tags.slice(0, 3).map(tag => (
                        <span key={tag} style={{ fontSize: 11, background: "#F2F2F7", color: "#3C3C43", padding: "3px 9px", borderRadius: 20, fontWeight: 500 }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {/* Detail */}
      {view === "detail" && selected && (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "0 0 48px" }}>
          <div style={{ height: 280, background: selected.color, overflow: "hidden", position: "relative", cursor: selected.image ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => selected.image && setImagePreview(true)}>
            {selected.image === "pdf" ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <svg width="64" height="80" viewBox="0 0 48 60" fill="none"><rect width="48" height="60" rx="6" fill="white" fillOpacity="0.2"/><path d="M8 4h24l12 12v40H8V4z" fill="white" fillOpacity="0.9"/><path d="M32 4l12 12H32V4z" fill="white" fillOpacity="0.5"/><text x="24" y="42" textAnchor="middle" fill="#C44B2B" fontSize="10" fontWeight="bold">PDF</text></svg>
              </div>
            ) : selected.image ? (
              <img src={selected.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : null}
            {selected.image && <div style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 12, padding: "5px 12px", borderRadius: 20, fontWeight: 500 }}>{selected.image === "pdf" ? "PDFを開く" : "全画面で見る"}</div>}
          </div>
          <div style={{ padding: "24px 20px" }}>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.3px", marginBottom: 4 }}>{selected.title}</div>
            <div style={{ fontSize: 15, color: "#8E8E93", marginBottom: 16 }}>{selected.source} · {selected.date}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 32 }}>
              {selected.tags.map(tag => (
                <span key={tag} style={{ fontSize: 13, background: "#E5E5EA", color: "#3C3C43", padding: "4px 12px", borderRadius: 20, fontWeight: 500 }}>{tag}</span>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {QUESTIONS.map((q, i) => (
                <div key={q.id} style={{ background: "#fff", borderRadius: i === 0 ? "12px 12px 2px 2px" : 2, padding: "16px 18px", marginBottom: 1 }}>
                  <div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 500, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{String(i + 1).padStart(2, "0")} · {q.label}</div>
                  <div style={{ fontSize: 15, lineHeight: 1.7, color: selected.answers[q.id] ? "#000" : "#C7C7CC" }}>{selected.answers[q.id] || "—"}</div>
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
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><div style={{ width: 28, height: 28, borderRadius: 99, background: "#E5E5EA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{entry.userIcon || "🎨"}</div><div style={{ fontSize: 14, fontWeight: 600, color: "#007AFF" }}>{entry.userName}</div></div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
                          {(entry.tags || []).map(tag => (
                            <span key={tag} style={{ fontSize: 11, background: "#F2F2F7", color: "#3C3C43", padding: "3px 9px", borderRadius: 20, fontWeight: 500 }}>{tag}</span>
                          ))}
                        </div>
                        {QUESTIONS.map(q => entry.answers?.[q.id] && (
                          <div key={q.id} style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 11, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{q.label}</div>
                            <div style={{ fontSize: 13, lineHeight: 1.6 }}>{entry.answers[q.id]}</div>
                          </div>
                        ))}
                        {entry.memo && (
                          <div>
                            <div style={{ fontSize: 11, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>その他メモ</div>
                            <div style={{ fontSize: 13, lineHeight: 1.6 }}>{entry.memo}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      )}

      {/* Insight */}
      {view === "map" && (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px" }}>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.5px", marginBottom: 24 }}>Insight</div>
          <div style={{ background: "#fff", borderRadius: 16, padding: "20px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#8E8E93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 18 }}>よく反応する要素</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => (
                <div key={tag}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{tag}</span>
                    <span style={{ fontSize: 13, color: "#8E8E93" }}>{count}</span>
                  </div>
                  <div style={{ height: 4, background: "#F2F2F7", borderRadius: 99 }}>
                    <div style={{ height: "100%", width: `${(count / maxCount) * 100}%`, background: "#007AFF", borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
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

      {/* 全画面プレビュー */}
      {imagePreview && selected?.image && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
          {selected.pdfData ? (
            <iframe src={selected.pdfData} style={{ width: "90vw", height: "90vh", border: "none" }} />
          ) : (
            <img src={selected.image} alt="" onClick={() => setImagePreview(false)} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", cursor: "zoom-out" }} />
          )}
          <button onClick={() => setImagePreview(false)} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", fontSize: 20, width: 40, height: 40, borderRadius: 99, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
      )}

      {/* 共有プロジェクト作成モーダル */}
      {creatingProject && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "#F2F2F7", width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", borderRadius: "20px 20px 0 0", padding: "0 0 32px" }}>
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
              <div style={{ width: 36, height: 4, background: "#D1D1D6", borderRadius: 99 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px 20px" }}>
              <button onClick={() => { setCreatingProject(false); setProjectUrl(null); setNewProjectTitle(""); setNewProjectImage(null); }} style={{ background: "none", border: "none", color: "#007AFF", fontSize: 17, cursor: "pointer" }}>閉じる</button>
              <div style={{ fontSize: 17, fontWeight: 600 }}>共有プロジェクト</div>
              <div style={{ width: 60 }} />
            </div>

            {projectUrl ? (
              <div style={{ padding: "0 20px", textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>プロジェクト作成完了</div>
                <div style={{ fontSize: 15, color: "#8E8E93", marginBottom: 24 }}>このURLを共有して一緒に解剖しよう</div>
                <div style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 16, wordBreak: "break-all", fontSize: 13, color: "#007AFF" }}>{projectUrl}</div>
                <button onClick={() => { navigator.clipboard.writeText(projectUrl); }} style={{ width: "100%", background: "#007AFF", color: "#fff", border: "none", padding: "14px", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>URLをコピー</button>
              </div>
            ) : (
              <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                <input type="file" accept="image/*" ref={projectFileRef} onChange={handleProjectImageUpload} style={{ display: "none" }} />
                {newProjectImage ? (
                  <div style={{ position: "relative", height: 180, borderRadius: 14, overflow: "hidden" }}>
                    <img src={newProjectImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button onClick={() => setNewProjectImage(null)} style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.55)", color: "#fff", border: "none", fontSize: 12, padding: "5px 12px", borderRadius: 20, cursor: "pointer" }}>削除</button>
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
                <button onClick={createProject} style={{ background: "#007AFF", color: "#fff", border: "none", padding: "16px", borderRadius: 14, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>プロジェクトを作成してURLを発行</button>
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
            {settingProfile && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <div style={{ width: 36, height: 4, background: "#D1D1D6", borderRadius: 99 }} />
              </div>
            )}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ width: 64, height: 64, borderRadius: 99, background: "#E5E5EA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 16px" }}>{profileForm.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{settingProfile ? "プロフィール編集" : "はじめまして"}</div>
              {!settingProfile && <div style={{ fontSize: 15, color: "#8E8E93" }}>名前とアイコンを設定しよう</div>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 20 }}>
              {ICONS.map(icon => (
                <button key={icon} onClick={() => setProfileForm(p => ({ ...p, icon }))} style={{ width: 44, height: 44, borderRadius: 12, background: profileForm.icon === icon ? "#007AFF" : "#fff", fontSize: 22, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</button>
              ))}
            </div>
            <div style={{ background: "#fff", borderRadius: 14, marginBottom: 16 }}>
              <input value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} placeholder="名前を入力" style={{ display: "block", width: "100%", padding: "14px 16px", fontSize: 16, border: "none", background: "transparent", fontFamily: "inherit", outline: "none", borderRadius: 14 }} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {settingProfile && <button onClick={() => setSettingProfile(false)} style={{ flex: 1, background: "#E5E5EA", color: "#000", border: "none", padding: "14px", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>キャンセル</button>}
              <button onClick={() => { if (!profileForm.name) return; const p = { name: profileForm.name, icon: profileForm.icon }; localStorage.setItem("naosu-profile", JSON.stringify(p)); setUserProfile(p); setSettingProfile(false); }} style={{ flex: 1, background: "#007AFF", color: "#fff", border: "none", padding: "14px", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{settingProfile ? "保存" : "始める"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}