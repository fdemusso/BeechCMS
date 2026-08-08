// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ComponentType } from 'react'
import type { IconProps } from 'reicon-react'
import { Folder, Document, ShoppingBag, Users, MessageSquare, Layout, UserCircle, Message, FileText, Image, Video, Music, Tag, Bookmark, Star, Heart, Globe, Link, Calendar, Clock, Map, Location, Package, Box, Archive, Database, Settings, Setting, Code, Book, BookOpen, GraduationCap, Award, Trophy, Flag, Layers, Grid, List, ChartBar, ChartPie, ChartBarTrendUp, Activity, Flash, Shield, Lock, Key, Bell, Phone, Camera, Mic, Monitor, Cpu, HardDrive, Wifi, Home, Building, Store, Briefcase, DollarSign, CreditCard, ShoppingCart, Truck, PercentageSquare, Hashtag, AtSign, InfoCircle, HelpCircle, AlertCircle, CheckCircle } from 'reicon-react'

export type IconComponent = ComponentType<IconProps>

const ICON_MAP: Record<string, IconComponent> = {
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
}

export function resolveIcon(name?: string): IconComponent {
  return (name && Object.hasOwn(ICON_MAP, name) ? ICON_MAP[name] : undefined) || Folder
}

export const ICON_NAMES: string[] = Object.keys(ICON_MAP)

