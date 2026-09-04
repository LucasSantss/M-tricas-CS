"use client";

type Props = {
  breadcrumb: string;
  title: string;
  configured: boolean;
  onOpenSettings: () => void;
};

export default function TopBar({ breadcrumb, title, configured, onOpenSettings }: Props) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="topbar-breadcrumb">{breadcrumb}</div>
        <div className="topbar-title">{title}</div>
      </div>
      <div className="topbar-right">
        <button
          className="topbar-icon-btn"
          title={configured ? "Ajustes (conectado)" : "Ajustes (conecte a API)"}
          onClick={onOpenSettings}
        >
          <span className={`status-dot ${configured ? "ok" : "bad"}`} style={{ position: "absolute", top: 6, right: 6 }} />
          ⚙️
        </button>
        <button className="topbar-icon-btn" title="Notificações" disabled>
          🔔
        </button>
        <button className="topbar-avatar" title="Perfil (em breve)" disabled>
          <span className="topbar-avatar-circle">?</span>
        </button>
      </div>
    </div>
  );
}
