// Ghi đè phân loại giấy phép cho các repo GitHub không tự nhận diện được (NOASSERTION) nhưng giấy phép
// thực tế đã rõ. Giá trị gốc từ GitHub vẫn được giữ và hiển thị song song trên website.
import { updateEntry, findEntry } from '../scripts/lib/catalog.mjs';

const O = {
  'pytorch/pytorch': { spdx: 'BSD-3-Clause', name: 'BSD-3-Clause (kiểu BSD)' },
  'n8n-io/n8n': { class: 'source-available', name: 'Sustainable Use License (fair-code)' },
  'langgenius/dify': { class: 'source-available', name: 'Dify Open Source License (Apache-2.0 + điều kiện)' },
  'open-webui/open-webui': { class: 'source-available', name: 'Open WebUI License (BSD-3 + điều khoản thương hiệu)' },
  'lobehub/lobehub': { class: 'source-available', name: 'LobeHub Community License' },
  'Significant-Gravitas/AutoGPT': { class: 'custom', name: 'Polyform Shield (nền tảng) + MIT' },
  'baptisteArno/typebot.io': { class: 'source-available', name: 'Functional Source License (FSL)' },
  'directus/directus': { spdx: 'BUSL-1.1', name: 'Business Source License 1.1' },
  'mongodb/mongo': { spdx: 'SSPL-1.0', name: 'Server Side Public License' },
  'airbytehq/airbyte': { class: 'source-available', name: 'Elastic License 2.0 (lõi) + MIT (connector)' },
  'Tencent-Hunyuan/HunyuanVideo': { class: 'source-available', name: 'Tencent Hunyuan Community License' },
  'fishaudio/fish-speech': { class: 'noncommercial', name: 'Giấy phép riêng (trọng số CC-BY-NC-SA)' },
  'redis/redis': { spdx: 'AGPL-3.0', name: 'RSALv2 / SSPLv1 / AGPLv3 (chọn một)' },
  'WordPress/WordPress': { spdx: 'GPL-2.0', name: 'GPL-2.0-or-later' },
  'woocommerce/woocommerce': { spdx: 'GPL-3.0', name: 'GPL-3.0' },
  'FFmpeg/FFmpeg': { spdx: 'LGPL-2.1', name: 'LGPL-2.1 / GPL (tùy cách biên dịch)' },
  'blender/blender': { spdx: 'GPL-3.0', name: 'GPL-3.0-or-later' },
  'GNOME/gimp': { spdx: 'GPL-3.0', name: 'GPL-3.0-or-later' },
  'notepad-plus-plus/notepad-plus-plus': { spdx: 'GPL-3.0', name: 'GPL-3.0' },
  'postgres/postgres': { spdx: 'PostgreSQL', name: 'PostgreSQL License' },
  'pgvector/pgvector': { spdx: 'PostgreSQL', name: 'PostgreSQL License' },
  'lucide-icons/lucide': { spdx: 'ISC', name: 'ISC' },
  'PrestaShop/PrestaShop': { spdx: 'OSL-3.0', name: 'OSL-3.0' },
  'opencart/opencart': { spdx: 'GPL-3.0', name: 'GPL-3.0' },
  'odoo/odoo': { spdx: 'LGPL-3.0', name: 'LGPL-3.0 (Community) – Enterprise trả phí' },
  'twentyhq/twenty': { spdx: 'AGPL-3.0', name: 'AGPL-3.0 + giấy phép thương mại (ee)' },
  'chatwoot/chatwoot': { spdx: 'MIT', name: 'MIT + giấy phép enterprise (ee)' },
  'activepieces/activepieces': { spdx: 'MIT', name: 'MIT + giấy phép enterprise (ee)' },
  'BerriAI/litellm': { spdx: 'MIT', name: 'MIT + giấy phép enterprise' },
  'PostHog/posthog': { spdx: 'MIT', name: 'MIT + giấy phép enterprise (ee)' },
  'strapi/strapi': { spdx: 'MIT', name: 'MIT + giấy phép enterprise (ee)' },
  'meilisearch/meilisearch': { spdx: 'MIT', name: 'MIT + BUSL (enterprise)' },
  'langfuse/langfuse': { spdx: 'MIT', name: 'MIT + giấy phép enterprise (ee)' },
  'metabase/metabase': { spdx: 'AGPL-3.0', name: 'AGPL-3.0 + bản Pro/Enterprise trả phí' },
  'Budibase/budibase': { spdx: 'GPL-3.0', name: 'GPL-3.0 (máy chủ) + MPL-2.0 (client)' },
  'baserow/baserow': { spdx: 'MIT', name: 'MIT + giấy phép premium/enterprise' },
  'Stirling-Tools/Stirling-PDF': { spdx: 'MIT', name: 'MIT + tính năng Pro có giấy phép riêng' },
  'dubinc/dub.link': { spdx: 'AGPL-3.0', name: 'AGPL-3.0 + giấy phép thương mại (ee)' },
  'mautic/mautic': { spdx: 'GPL-3.0', name: 'GPL-3.0' },
  'formbricks/formbricks': { spdx: 'AGPL-3.0', name: 'AGPL-3.0 + giấy phép enterprise (ee)' },
  'growthbook/growthbook': { spdx: 'MIT', name: 'MIT + giấy phép enterprise' },
  'windmill-labs/windmill': { spdx: 'AGPL-3.0', name: 'AGPL-3.0 + giấy phép enterprise' },
  'vendurehq/vendure': { spdx: 'GPL-3.0', name: 'GPL-3.0 hoặc giấy phép thương mại' },
  'withastro/astro': { spdx: 'MIT', name: 'MIT' },
  'GrapesJS/grapesjs': { spdx: 'BSD-3-Clause', name: 'BSD-3-Clause' },
  'medusajs/medusa': { spdx: 'MIT', name: 'MIT' },
  'keepassxreboot/keepassxc': { spdx: 'GPL-3.0', name: 'GPL-2.0/3.0' },
  'audacity/audacity': { spdx: 'GPL-3.0', name: 'GPL-3.0' },
  'HandBrake/HandBrake': { spdx: 'GPL-2.0', name: 'GPL-2.0' },
  'opentoonz/opentoonz': { spdx: 'BSD-3-Clause', name: 'BSD-3-Clause (sửa đổi)' },
  'awesome-selfhosted/awesome-selfhosted': { spdx: 'CC-BY-SA-3.0', name: 'CC-BY-SA-3.0' },
  'modelcontextprotocol/servers': { class: 'permissive', name: 'MIT / Apache-2.0' },
  'anthropics/skills': { class: 'custom', name: 'Theo từng kỹ năng (Apache-2.0 / source-available)' },
  'nodejs/node': { spdx: 'MIT', name: 'MIT (kèm giấy phép thành phần bên thứ ba)' },
};

let ok = 0;
for (const [id, lo] of Object.entries(O)) {
  if (!findEntry(id)) { console.log('không có trong catalog:', id); continue; }
  updateEntry(id, { license_override: lo });
  ok++;
}
console.log(`Đã ghi license_override cho ${ok} repo.`);
