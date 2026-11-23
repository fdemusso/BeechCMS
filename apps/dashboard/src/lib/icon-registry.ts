// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ComponentType } from 'react'
import { isDashboardIconName, type DashboardIconName } from '@beechcms/core'
import type { IconProps } from '@/components/icons'
import { Folder, Document, ShoppingBag, Users, MessageSquare, Layout, UserCircle, Message, FileText, Image, Video, Music, Tag, Bookmark, Star, Heart, Globe, Link, Calendar, Clock, Map, Location, Package, Box, Archive, Database, Settings, Setting, Code, Book, BookOpen, GraduationCap, Award, Trophy, Flag, Layers, Grid, List, ChartBar, ChartPie, ChartBarTrendUp, Activity, Flash, Shield, Lock, Key, Bell, Phone, Camera, Mic, Monitor, Cpu, HardDrive, Wifi, Home, Building, Store, Briefcase, DollarSign, CreditCard, ShoppingCart, Truck, PercentageSquare, Hashtag, AtSign, InfoCircle, HelpCircle, AlertCircle, CheckCircle, Car, ClipboardList, ClipboardCheck, Checklist, Warehouse, Receipt, Wallet, User, Gift, Rocket, Lifebuoy } from '@/components/icons'

export type IconComponent = ComponentType<IconProps>

// Typed by the core list: a name added to or removed from DASHBOARD_ICON_NAMES without its component here fails type-check.
// Named imports (not `import *`) keep the ~2,700-icon kit tree-shaken.
const ICON_MAP: Record<DashboardIconName, IconComponent> = {
  Folder,
  Newspaper: Document,
  ShoppingBag,
  Users,
  MessageSquare,
  Layout,
  UserCircle,
  Mail: Message,
  FileText,
  Image,
  Video,
  Music,
  Tag,
  Bookmark,
  Star,
  Heart,
  Globe,
  Link,
  Calendar,
  Clock,
  Map,
  MapPin: Location,
  Package,
  Box,
  Archive,
  Database,
  Settings,
  Wrench: Setting,
  Code,
  Terminal: Code,
  Book,
  BookOpen,
  GraduationCap,
  Award,
  Trophy,
  Flag,
  Layers,
  Grid,
  List,
  Table: Grid,
  BarChart: ChartBar,
  PieChart: ChartPie,
  TrendingUp: ChartBarTrendUp,
  Activity,
  Zap: Flash,
  Shield,
  Lock,
  Key,
  Bell,
  Phone,
  Camera,
  Mic,
  Monitor,
  Cpu,
  HardDrive,
  Wifi,
  Home,
  Building,
  Store,
  Briefcase,
  DollarSign,
  CreditCard,
  ShoppingCart,
  Truck,
  Percent: PercentageSquare,
  Hash: Hashtag,
  AtSign,
  Info: InfoCircle,
  HelpCircle,
  AlertCircle,
  CheckCircle,
  Car,
  ClipboardList,
  ClipboardCheck,
  Checklist,
  Warehouse,
  Receipt,
  Wallet,
  User,
  Gift,
  Rocket,
  LifeBuoy: Lifebuoy,
}

export function resolveIcon(name?: string): IconComponent {
  return (name && isDashboardIconName(name) ? ICON_MAP[name] : undefined) || Folder
}

export const ICON_NAMES: string[] = Object.keys(ICON_MAP)

