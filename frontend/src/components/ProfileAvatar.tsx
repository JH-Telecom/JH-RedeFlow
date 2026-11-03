// Foto (ou iniciais) do usuario. So exibe: a troca de foto fica em Configuracoes > Meu perfil.
export function ProfileAvatar({ name, photo, className = "" }: { name: string; photo: string | null; className?: string }) {
  const initials = name.split(" ").map((part) => part[0]).slice(0, className.includes("topbar") ? 1 : 2).join("");
  return <span className={`profile-photo-button ${className}`} aria-hidden="true">{photo ? <img src={photo} alt="" /> : initials}</span>;
}
