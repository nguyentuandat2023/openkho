import {
  AudioLines, BarChart, Blocks, Bot, Brain, Clapperboard, Database, Film, Globe, GraduationCap, Handshake,
  Megaphone, MessageSquare, Palette, Plug, Server, ShoppingCart, Sparkles, Terminal, TrendingUp, Workflow, Zap,
  Layers, Smartphone, Shield, Cloud, Package, SquareCheck, House, Flame, Wrench,
  type LucideIcon,
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  brain: Brain, bot: Bot, megaphone: Megaphone, workflow: Workflow, clapperboard: Clapperboard, 'audio-lines': AudioLines,
  'message-square': MessageSquare, plug: Plug, globe: Globe, blocks: Blocks, 'trending-up': TrendingUp, 'bar-chart': BarChart,
  zap: Zap, film: Film, palette: Palette, 'shopping-cart': ShoppingCart, handshake: Handshake, server: Server,
  terminal: Terminal, database: Database, 'graduation-cap': GraduationCap, sparkles: Sparkles,
  // Biểu tượng cho 20 lĩnh vực công nghệ (data/areas.yaml)
  layers: Layers, smartphone: Smartphone, shield: Shield, cloud: Cloud, package: Package, 'check-square': SquareCheck,
  home: House, flame: Flame, wrench: Wrench,
};

export function CategoryIcon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const I = CATEGORY_ICONS[name] || Sparkles;
  return <I size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
}

export default CategoryIcon;
