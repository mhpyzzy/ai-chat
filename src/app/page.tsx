import { redirect } from "next/navigation";

// 根路由重定向到 /chat：
// /chat 是功能完整的 Agent 对话页（含 Tool Calling 渲染），
// 把根路径指向它，避免存在两个相似的聊天入口造成混乱。
export default function Home() {
  redirect("/chat");
}
