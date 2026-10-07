// His admin sheet (assets/css/admin.css), for the staged /preview/admin-*
// screens. Our own admin shell imports it directly; the staged pages are
// generated components with no shell of ours around them, so without this they
// render his markup with none of his .adm-* layout.
import "../styles/ds-admin.css";

export default function DsAdminStyles() {
  return null;
}
