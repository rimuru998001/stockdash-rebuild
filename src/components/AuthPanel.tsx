import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

type Props = {
  user: User | null;
  onAuthChange: () => Promise<void> | void;
};

export function AuthPanel({ user, onAuthChange }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (!supabase) return setMessage("尚未設定雲端同步");
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setMessage(`登入失敗：${error.message}`);
    setMessage("登入成功");
    await onAuthChange();
  }

  async function signUp() {
    if (!supabase) return setMessage("尚未設定雲端同步");
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) return setMessage(`註冊失敗：${error.message}`);
    setMessage("註冊成功，請檢查信箱驗證信");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setMessage("已登出");
    await onAuthChange();
  }

  if (!isSupabaseConfigured) return <div className="authHint">尚未設定雲端同步</div>;

  if (user) {
    return (
      <div className="authPanel compact">
        <span>{user.email}</span>
        <button className="danger small" onClick={signOut}>登出</button>
      </div>
    );
  }

  return (
    <div className="authPanel">
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button disabled={busy} onClick={signIn}>登入</button>
      <button disabled={busy} onClick={signUp}>註冊</button>
      {message && <span className="statusText">{message}</span>}
    </div>
  );
}
