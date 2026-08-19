// src/components/icons.jsx
//
// ONE icon library for the whole product: Hugeicons.
//
// The site had icons from three react-icons families (fa, fi, fa6) plus 79
// hand-drawn inline <svg> blocks, so stroke weight, corner radius and optical
// size changed from panel to panel. Everything routes through here now.
//
// The exports keep their old react-icons NAMES on purpose. That is what made
// this migration safe: 41 files changed one import line each and not a single
// piece of JSX moved, so there was no opportunity to quietly break a layout
// while swapping a library.
//
// Sizing: callers overwhelmingly size with Tailwind ('w-4 h-4'), and a CSS
// width beats the SVG width attribute, so those are unaffected. Anything
// without a class gets DEFAULT_SIZE.
//
// GENERATED-ish: the name map was resolved against @hugeicons/core-free-icons
// and every target verified to exist before this file was written. If you add
// an icon, import it below and export it the same way — do NOT import from
// react-icons again.

import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Activity01Icon,
  Add01Icon,
  Agreement01Icon,
  Alert02Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  BookOpen01Icon,
  BubbleChatIcon,
  BugIcon,
  Calendar03Icon,
  Call02Icon,
  Cancel01Icon,
  CancelCircleIcon,
  ChartBarLineIcon,
  ChartLineData01Icon,
  ChartUpIcon,
  CheckmarkCircle02Icon,
  CheckmarkSquare02Icon,
  ClipboardIcon,
  Clock01Icon,
  Coins01Icon,
  ComputerIcon,
  ComputerTerminal01Icon,
  Copy01Icon,
  CubeIcon,
  DashboardSpeed01Icon,
  DashboardSquare01Icon,
  Delete02Icon,
  DollarCircleIcon,
  Download01Icon,
  DragDropVerticalIcon,
  Edit02Icon,
  File01Icon,
  FileImportIcon,
  FlashIcon,
  FloppyDiskIcon,
  Folder01Icon,
  GiftIcon,
  GroupItemsIcon,
  HelpCircleIcon,
  Home01Icon,
  Image01Icon,
  InformationCircleIcon,
  InstagramIcon,
  Invoice01Icon,
  JusticeScale01Icon,
  KeyIcon,
  KeyboardIcon,
  Layers01Icon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  LifebuoyIcon,
  Link01Icon,
  LinkSquare01Icon,
  Linkedin01Icon,
  Loading03Icon,
  Location01Icon,
  LockIcon,
  Logout01Icon,
  MagicWand01Icon,
  MapsIcon,
  Menu01Icon,
  NewTwitterIcon,
  Notification01Icon,
  PackageIcon,
  Pdf01Icon,
  PenTool01Icon,
  PieChartIcon,
  PlayCircleIcon,
  PlusSignSquareIcon,
  QrCodeIcon,
  RefreshIcon,
  SafetyPin01Icon,
  Search01Icon,
  SentIcon,
  Settings01Icon,
  Settings02Icon,
  Share01Icon,
  Shield01Icon,
  ShoppingCart01Icon,
  SquareIcon,
  StarIcon,
  Tag01Icon,
  Task01Icon,
  Tick02Icon,
  Time04Icon,
  UnlinkIcon,
  Upload01Icon,
  UserAdd01Icon,
  UserIcon,
  UserMultiple02Icon,
  UserRemove01Icon,
  ViewIcon,
  Wallet01Icon,
  WhatsappIcon,
  WorkflowSquare01Icon,
  Wrench01Icon,
  Xls01Icon,
  YoutubeIcon,
  Alert01Icon,
  Building06Icon,
  CalculatorIcon,
  ChampionIcon,
  Moon02Icon,
  MortarboardIcon,
  PlaySquareIcon,
  SparklesIcon,
  Sun01Icon,
  ViewOffIcon,
  CheckmarkBadge01Icon,
  GlobalIcon,
} from "@hugeicons/core-free-icons";

// Bigger than react-icons' 1em default — these read as buttons and affordances,
// not as text decoration.
const DEFAULT_SIZE = 22;
const DEFAULT_STROKE = 1.8;

function make(icon, displayName) {
  function Ico({ size = DEFAULT_SIZE, strokeWidth = DEFAULT_STROKE, ...rest }) {
    return (
      <HugeiconsIcon icon={icon} size={size} strokeWidth={strokeWidth} {...rest} />
    );
  }
  Ico.displayName = displayName;
  return Ico;
}

export const FaArrowDown = make(ArrowDown01Icon, "FaArrowDown");
export const FaArrowLeft = make(ArrowLeft01Icon, "FaArrowLeft");
export const FaArrowRight = make(ArrowRight01Icon, "FaArrowRight");
export const FaArrowUp = make(ArrowUp01Icon, "FaArrowUp");
export const FaBalanceScale = make(JusticeScale01Icon, "FaBalanceScale");
export const FaBars = make(Menu01Icon, "FaBars");
export const FaBoxes = make(PackageIcon, "FaBoxes");
export const FaBug = make(BugIcon, "FaBug");
export const FaCalendarAlt = make(Calendar03Icon, "FaCalendarAlt");
export const FaChartBar = make(ChartBarLineIcon, "FaChartBar");
export const FaChartLine = make(ChartLineData01Icon, "FaChartLine");
export const FaChartPie = make(PieChartIcon, "FaChartPie");
export const FaCheck = make(Tick02Icon, "FaCheck");
export const FaCheckCircle = make(CheckmarkCircle02Icon, "FaCheckCircle");
export const FaCheckSquare = make(CheckmarkSquare02Icon, "FaCheckSquare");
export const FaChevronDown = make(ArrowDown01Icon, "FaChevronDown");
export const FaChevronRight = make(ArrowRight01Icon, "FaChevronRight");
export const FaChevronUp = make(ArrowUp01Icon, "FaChevronUp");
export const FaClipboardList = make(ClipboardIcon, "FaClipboardList");
export const FaClock = make(Clock01Icon, "FaClock");
export const FaCog = make(Settings01Icon, "FaCog");
export const FaCogs = make(Settings02Icon, "FaCogs");
export const FaCoins = make(Coins01Icon, "FaCoins");
export const FaCopy = make(Copy01Icon, "FaCopy");
export const FaCube = make(CubeIcon, "FaCube");
export const FaCubes = make(CubeIcon, "FaCubes");
export const FaDownload = make(Download01Icon, "FaDownload");
export const FaEdit = make(Edit02Icon, "FaEdit");
export const FaExclamationTriangle = make(Alert02Icon, "FaExclamationTriangle");
export const FaExternalLinkAlt = make(LinkSquare01Icon, "FaExternalLinkAlt");
export const FaEye = make(ViewIcon, "FaEye");
export const FaFileContract = make(Agreement01Icon, "FaFileContract");
export const FaFileExcel = make(Xls01Icon, "FaFileExcel");
export const FaFileImport = make(FileImportIcon, "FaFileImport");
export const FaFileInvoiceDollar = make(Invoice01Icon, "FaFileInvoiceDollar");
export const FaFilePdf = make(Pdf01Icon, "FaFilePdf");
export const FaFolder = make(Folder01Icon, "FaFolder");
export const FaGripVertical = make(DragDropVerticalIcon, "FaGripVertical");
export const FaHardHat = make(SafetyPin01Icon, "FaHardHat");
export const FaHistory = make(Time04Icon, "FaHistory");
export const FaInfoCircle = make(InformationCircleIcon, "FaInfoCircle");
export const FaInstagram = make(InstagramIcon, "FaInstagram");
export const FaKey = make(KeyIcon, "FaKey");
export const FaKeyboard = make(KeyboardIcon, "FaKeyboard");
export const FaLayerGroup = make(Layers01Icon, "FaLayerGroup");
export const FaLink = make(Link01Icon, "FaLink");
export const FaLinkedin = make(Linkedin01Icon, "FaLinkedin");
export const FaListOl = make(LeftToRightListNumberIcon, "FaListOl");
export const FaListUl = make(LeftToRightListBulletIcon, "FaListUl");
export const FaLock = make(LockIcon, "FaLock");
export const FaMagic = make(MagicWand01Icon, "FaMagic");
export const FaObjectGroup = make(GroupItemsIcon, "FaObjectGroup");
export const FaPaperPlane = make(SentIcon, "FaPaperPlane");
export const FaPen = make(PenTool01Icon, "FaPen");
export const FaPencilAlt = make(Edit02Icon, "FaPencilAlt");
export const FaPlus = make(Add01Icon, "FaPlus");
export const FaProjectDiagram = make(WorkflowSquare01Icon, "FaProjectDiagram");
export const FaQrcode = make(QrCodeIcon, "FaQrcode");
export const FaRegCommentDots = make(BubbleChatIcon, "FaRegCommentDots");
export const FaRegSquare = make(SquareIcon, "FaRegSquare");
export const FaSave = make(FloppyDiskIcon, "FaSave");
export const FaSearch = make(Search01Icon, "FaSearch");
export const FaShareAlt = make(Share01Icon, "FaShareAlt");
export const FaShieldAlt = make(Shield01Icon, "FaShieldAlt");
export const FaSpinner = make(Loading03Icon, "FaSpinner");
export const FaSync = make(RefreshIcon, "FaSync");
export const FaSyncAlt = make(RefreshIcon, "FaSyncAlt");
export const FaTachometerAlt = make(DashboardSpeed01Icon, "FaTachometerAlt");
export const FaTag = make(Tag01Icon, "FaTag");
export const FaTasks = make(Task01Icon, "FaTasks");
export const FaTerminal = make(ComputerTerminal01Icon, "FaTerminal");
export const FaThLarge = make(DashboardSquare01Icon, "FaThLarge");
export const FaTimes = make(Cancel01Icon, "FaTimes");
export const FaTimesCircle = make(CancelCircleIcon, "FaTimesCircle");
export const FaTools = make(Wrench01Icon, "FaTools");
export const FaTrash = make(Delete02Icon, "FaTrash");
export const FaTrashAlt = make(Delete02Icon, "FaTrashAlt");
export const FaUnlink = make(UnlinkIcon, "FaUnlink");
export const FaUpload = make(Upload01Icon, "FaUpload");
export const FaUserFriends = make(UserMultiple02Icon, "FaUserFriends");
export const FaUserPlus = make(UserAdd01Icon, "FaUserPlus");
export const FaUsers = make(UserMultiple02Icon, "FaUsers");
export const FaWallet = make(Wallet01Icon, "FaWallet");
export const FaWhatsapp = make(WhatsappIcon, "FaWhatsapp");
export const FaXTwitter = make(NewTwitterIcon, "FaXTwitter");
export const FaYoutube = make(YoutubeIcon, "FaYoutube");
export const FiActivity = make(Activity01Icon, "FiActivity");
export const FiArrowDown = make(ArrowDown01Icon, "FiArrowDown");
export const FiArrowLeft = make(ArrowLeft01Icon, "FiArrowLeft");
export const FiArrowRight = make(ArrowRight01Icon, "FiArrowRight");
export const FiArrowUp = make(ArrowUp01Icon, "FiArrowUp");
export const FiBell = make(Notification01Icon, "FiBell");
export const FiBookOpen = make(BookOpen01Icon, "FiBookOpen");
export const FiBox = make(PackageIcon, "FiBox");
export const FiCalendar = make(Calendar03Icon, "FiCalendar");
export const FiCheck = make(Tick02Icon, "FiCheck");
export const FiCheckSquare = make(CheckmarkSquare02Icon, "FiCheckSquare");
export const FiChevronDown = make(ArrowDown01Icon, "FiChevronDown");
export const FiChevronRight = make(ArrowRight01Icon, "FiChevronRight");
export const FiClipboard = make(ClipboardIcon, "FiClipboard");
export const FiClock = make(Clock01Icon, "FiClock");
export const FiCpu = make(ComputerIcon, "FiCpu");
export const FiDollarSign = make(DollarCircleIcon, "FiDollarSign");
export const FiDownload = make(Download01Icon, "FiDownload");
export const FiExternalLink = make(LinkSquare01Icon, "FiExternalLink");
export const FiFileText = make(File01Icon, "FiFileText");
export const FiGift = make(GiftIcon, "FiGift");
export const FiGrid = make(DashboardSquare01Icon, "FiGrid");
export const FiHelpCircle = make(HelpCircleIcon, "FiHelpCircle");
export const FiHome = make(Home01Icon, "FiHome");
export const FiImage = make(Image01Icon, "FiImage");
export const FiInfo = make(InformationCircleIcon, "FiInfo");
export const FiLayers = make(Layers01Icon, "FiLayers");
export const FiLifeBuoy = make(LifebuoyIcon, "FiLifeBuoy");
export const FiLock = make(LockIcon, "FiLock");
export const FiLogOut = make(Logout01Icon, "FiLogOut");
export const FiMap = make(MapsIcon, "FiMap");
export const FiMapPin = make(Location01Icon, "FiMapPin");
export const FiPlayCircle = make(PlayCircleIcon, "FiPlayCircle");
export const FiPlus = make(Add01Icon, "FiPlus");
export const FiPlusSquare = make(PlusSignSquareIcon, "FiPlusSquare");
export const FiRotateCcw = make(RefreshIcon, "FiRotateCcw");
export const FiSave = make(FloppyDiskIcon, "FiSave");
export const FiSearch = make(Search01Icon, "FiSearch");
export const FiShield = make(Shield01Icon, "FiShield");
export const FiShoppingCart = make(ShoppingCart01Icon, "FiShoppingCart");
export const FiStar = make(StarIcon, "FiStar");
export const FiTag = make(Tag01Icon, "FiTag");
export const FiTool = make(Wrench01Icon, "FiTool");
export const FiTrash2 = make(Delete02Icon, "FiTrash2");
export const FiTrendingUp = make(ChartUpIcon, "FiTrendingUp");
export const FiUser = make(UserIcon, "FiUser");
export const FiUserX = make(UserRemove01Icon, "FiUserX");
export const FiUsers = make(UserMultiple02Icon, "FiUsers");
export const FiX = make(Cancel01Icon, "FiX");
export const FiZap = make(FlashIcon, "FiZap");

/* ── Semantic names ───────────────────────────────────────────────────────
   These replaced hand-drawn inline <svg> blocks. Prefer these over the
   react-icons aliases above when adding anything new — the aliases only
   exist so the library swap could be done without touching any JSX. */
export const IconAlertCircle = make(Alert01Icon, "IconAlertCircle");
export const IconAlertTriangle = make(Alert02Icon, "IconAlertTriangle");
export const IconArrowLeft = make(ArrowLeft01Icon, "IconArrowLeft");
export const IconArrowRight = make(ArrowRight01Icon, "IconArrowRight");
export const IconBook = make(BookOpen01Icon, "IconBook");
export const IconBuilding = make(Building06Icon, "IconBuilding");
export const IconCalculator = make(CalculatorIcon, "IconCalculator");
export const IconCalendar = make(Calendar03Icon, "IconCalendar");
export const IconCart = make(ShoppingCart01Icon, "IconCart");
export const IconCheck = make(Tick02Icon, "IconCheck");
export const IconChevronRight = make(ArrowRight01Icon, "IconChevronRight");
export const IconClose = make(Cancel01Icon, "IconClose");
export const IconCube = make(CubeIcon, "IconCube");
export const IconDesktop = make(ComputerIcon, "IconDesktop");
export const IconDownload = make(Download01Icon, "IconDownload");
export const IconEye = make(ViewIcon, "IconEye");
export const IconEyeOff = make(ViewOffIcon, "IconEyeOff");
export const IconGift = make(GiftIcon, "IconGift");
export const IconGraduation = make(MortarboardIcon, "IconGraduation");
export const IconLink = make(Link01Icon, "IconLink");
export const IconLock = make(LockIcon, "IconLock");
export const IconMenu = make(Menu01Icon, "IconMenu");
export const IconMoon = make(Moon02Icon, "IconMoon");
export const IconPhone = make(Call02Icon, "IconPhone");
export const IconPlayCircle = make(PlayCircleIcon, "IconPlayCircle");
export const IconPlaySquare = make(PlaySquareIcon, "IconPlaySquare");
export const IconPlus = make(Add01Icon, "IconPlus");
export const IconRefresh = make(RefreshIcon, "IconRefresh");
export const IconSearch = make(Search01Icon, "IconSearch");
export const IconShield = make(Shield01Icon, "IconShield");
export const IconSparkle = make(SparklesIcon, "IconSparkle");
export const IconStar = make(StarIcon, "IconStar");
export const IconSun = make(Sun01Icon, "IconSun");
export const IconTrophy = make(ChampionIcon, "IconTrophy");
export const IconUser = make(UserIcon, "IconUser");
export const IconUsers = make(UserMultiple02Icon, "IconUsers");
export const IconLayout = make(DashboardSquare01Icon, "IconLayout");
export const IconShieldCheck = make(CheckmarkBadge01Icon, "IconShieldCheck");
export const IconGlobe = make(GlobalIcon, "IconGlobe");
export const IconWorkflow = make(WorkflowSquare01Icon, "IconWorkflow");
