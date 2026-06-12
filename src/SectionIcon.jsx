import React from 'react';
import {
  Ruler, Scissors, Heart, Star, Wrench, Briefcase,
  Home, Zap, Leaf, Music, Camera, Globe, Activity,
  ShoppingBag, Truck, FileText, Package, Car, Coffee, Layers, Eye
} from 'lucide-react';

const ICON_MAP = {
  Ruler, Scissors, Heart, Star, Wrench, Briefcase,
  Home, Zap, Leaf, Music, Camera, Globe, Activity,
  ShoppingBag, Truck, FileText, Package, Car, Coffee, Layers, Eye
};

const SectionIcon = ({ name, size = 20, ...props }) => {
  const Icon = ICON_MAP[name] || FileText;
  return <Icon size={size} {...props} />;
};

export const SECTION_ICON_LIST = Object.entries(ICON_MAP).map(([name, Icon]) => ({ name, Icon }));

export default SectionIcon;
