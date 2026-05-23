/**
 * lucide 图标分类规则。
 *
 * 把 1893 个图标按用途分到 22 个类目(20 大类 + 常用 + 其他)。
 * 一个图标只属于一个分类:按 RULES 顺序匹配,先命中的归到那一类。
 * 未匹配的归到"其他"。
 *
 * 重新分类时:改这里的 RULES / FAVORITES 即可,无需重新生成 icon-zh.ts。
 */
import { ICON_ZH } from './icon-zh';

export type CategoryId =
  | 'fav' | 'people' | 'file' | 'comm' | 'time' | 'media'
  | 'tool' | 'chart' | 'arrow' | 'shape' | 'device' | 'nature'
  | 'food' | 'transport' | 'building' | 'money' | 'edit'
  | 'status' | 'emoji' | 'layout' | 'party' | 'other';

export interface Category {
  id: CategoryId;
  label: string;
  /** 侧栏小图标(从 lucide 直接选用) */
  icon: string;
}

export const CATEGORIES: Category[] = [
  { id: 'fav',       label: '常用',     icon: 'StarIcon' },
  { id: 'people',    label: '用户人物', icon: 'UserIcon' },
  { id: 'file',      label: '文件文档', icon: 'FileIcon' },
  { id: 'comm',      label: '通信消息', icon: 'MailIcon' },
  { id: 'time',      label: '时间日期', icon: 'ClockIcon' },
  { id: 'media',     label: '媒体播放', icon: 'PlayIcon' },
  { id: 'tool',      label: '设置工具', icon: 'SettingsIcon' },
  { id: 'chart',     label: '图表数据', icon: 'BarChart3Icon' },
  { id: 'arrow',     label: '箭头方向', icon: 'ArrowRightIcon' },
  { id: 'shape',     label: '几何形状', icon: 'ShapesIcon' },
  { id: 'device',    label: '设备硬件', icon: 'MonitorIcon' },
  { id: 'nature',    label: '天气自然', icon: 'SunIcon' },
  { id: 'food',      label: '食物饮品', icon: 'CoffeeIcon' },
  { id: 'transport', label: '交通工具', icon: 'CarIcon' },
  { id: 'building',  label: '建筑场所', icon: 'BuildingIcon' },
  { id: 'money',     label: '货币金融', icon: 'WalletIcon' },
  { id: 'edit',      label: '编辑文本', icon: 'PencilIcon' },
  { id: 'status',    label: '状态标识', icon: 'CheckCircleIcon' },
  { id: 'emoji',     label: '表情情绪', icon: 'SmileIcon' },
  { id: 'layout',    label: '布局对齐', icon: 'LayoutGridIcon' },
  { id: 'party',     label: '党建通用', icon: 'AwardIcon' },
  { id: 'other',     label: '其他',     icon: 'PackageIcon' },
];

/* ────────── 常用(手动精选,顺序就是显示顺序) ────────── */

export const FAVORITES: string[] = [
  // 导航 / 操作核心
  'HomeIcon', 'SearchIcon', 'MenuIcon', 'SettingsIcon', 'BellIcon',
  // 用户 / 鉴权
  'UserIcon', 'UsersIcon', 'LockIcon', 'UnlockIcon', 'ShieldIcon',
  // 增删改操作
  'PlusIcon', 'MinusIcon', 'EditIcon', 'PencilIcon', 'TrashIcon', 'SaveIcon', 'CopyIcon',
  // 状态
  'CheckIcon', 'XIcon', 'AlertCircleIcon', 'InfoIcon', 'StarIcon', 'HeartIcon',
  // 文件 / 共享
  'FileIcon', 'FolderIcon', 'DownloadIcon', 'UploadIcon', 'ShareIcon', 'LinkIcon',
  // 时间 / 通信
  'CalendarIcon', 'ClockIcon', 'MailIcon', 'MessageSquareIcon', 'PhoneIcon', 'SendIcon',
  // 视图 / 显示
  'EyeIcon', 'EyeOffIcon', 'RefreshCwIcon', 'FilterIcon',
  // 党建场景
  'AwardIcon', 'TrophyIcon', 'FlagIcon', 'BookOpenIcon', 'HandshakeIcon',
  // 通用箭头
  'ChevronDownIcon', 'ChevronRightIcon', 'ArrowLeftIcon', 'ArrowRightIcon',
  'MoreHorizontalIcon', 'MoreVerticalIcon', 'ExternalLinkIcon',
];

/* ────────── 分类规则(按顺序匹配) ────────── */

type Rule = { cat: CategoryId; test: RegExp };

// 规则顺序很重要 —— 先匹配的拿到归类
// 注意:icon 名字总是以 "Icon" 结尾,所以规则全部用**前缀匹配**(无 `$`)
// 想要精确匹配只一个图标时,直接 hardcode 完整名(如 ^HomeIcon$)
const RULES: Rule[] = [
  /* 党建 / 荣誉(放最前 —— Award*, Trophy*, Star* 别被其他规则吃掉) */
  { cat: 'party', test: /^(Award|Trophy|Medal|Crown|Flag|Bookmark|Handshake|Stamp|Sparkle|Sparkles|Star(?!t)|BookOpen|Library|GraduationCap|Ribbon|PartyPopper|Gift|Vote|Speech|VenetianMask|Drama)/ },

  /* 箭头方向 / 导航 / 地图 */
  { cat: 'arrow', test: /^(Arrow|Chevron|Caret|Move|Corner|Redo|Undo|RotateC?cw|Rotate3d|RefreshCcw|RefreshCw|Repeat|Shuffle|StepBack|StepForward|FastForward|Rewind|SkipBack|SkipForward|Navigation|Compass|MousePointer|Map|Locate|LocationEdit|Crosshair|Waypoints|Route|Milestone|SignpostIcon|Signpost|Goal|Direction)/ },

  /* 表情 / 心 */
  { cat: 'emoji', test: /^(Smile|Frown|Laugh|Angry|Annoyed|Meh|Heart|ThumbsUp|ThumbsDown|Skull|Ghost)/ },

  /* 货币 / 金融 */
  { cat: 'money', test: /^(Dollar|Euro|Yen|Pound|Indian|Russian|Swiss|Bitcoin|Banknote|CreditCard|Coin|Wallet|PiggyBank|Receipt|HandCoins|Vault|Calculator|JapaneseYen|PoundSterling|RussianRuble|SwissFranc|IndianRupee|TurkishLira|Percent|Landmark|CircleDollar|SquareDollar|BadgeDollar|BadgeEuro|BadgeIndianRupee|BadgeJapaneseYen|BadgePoundSterling|BadgeRussianRuble|BadgeSwissFranc|BadgeTurkishLira)/ },

  /* 时间 / 日期 */
  { cat: 'time', test: /^(Clock|Calendar|Watch|Timer|Hourglass|Alarm|Stopwatch|History)/ },

  /* 通信 / 消息 / 通知 */
  { cat: 'comm', test: /^(Mail|Mails|Message|Inbox|Send|Reply|Forward|Phone|Voicemail|AtSign|AtSigns|Rss|Podcast|Megaphone|Bell|Notification)/ },

  /* 媒体 / 播放(图像、音频、视频、影音设备) */
  { cat: 'media', test: /^(Play|Pause|Stop|Volume|Music|Video|Film|Camera|Image|Images|Picture|Mic|Speaker|Headphone|Headphones|Headset|Disc|Cassette|Vinyl|Radio|Tv|MonitorPlay|MonitorStop|MonitorPause|MonitorSpeaker|Clapper|Album|AudioLines|AudioWaveform|EarbudIcon|Drum|Trumpet|Piano|Guitar|Voicemail|Tally)/ },

  /* 图表 / 数据 */
  { cat: 'chart', test: /(Chart\d?Icon|GraphIcon)$|^(Chart|Activity|Trending|Database|Gauge|Sigma|FunnelIcon|PieChart|BarChart|LineChart|AreaChart|ScatterChart|CandlestickChart|WaveformIcon|Binary|HeartPulse|ListChecks|Decimal|Decimals)/ },

  /* 编辑 / 文本格式 / 代码 */
  { cat: 'edit', test: /^(Bold|Italic|Underline|Strikethrough|Heading|Quote|Quotes|Pilcrow|Subscript|Superscript|WrapText|Indent|Outdent|Type|TextSelect|TextSelection|TextCursor|CaseSensitive|CaseLower|CaseUpper|Highlighter|Pencil|Brush|Eraser|TextQuote|TextSearch|RemoveFormatting|Baseline|WholeWord|SpellCheck|Replace|Regex|Languages|Braces|Brackets|Parentheses|ALargeSmall|AArrow|Text|Pen|Code|Terminal|Git|FileCode|FileJson|Hash|Variable|Function|Bug|Json|Xml|Captions)/ },

  /* 布局 / 对齐 / 排版 */
  { cat: 'layout', test: /^(Align|Layout|Grid|Columns|Rows|Sidebar|Panel|Panels|Table|Rectangle|StretchHorizontal|StretchVertical|Spline|Kanban|SplitSquare|Split|Separator|Tabs|Square|BringToFront|SendToBack|Merge|Workflow|Component|Combine|Gallery|Container|BetweenHorizontal|BetweenVertical|BetweenHorizonal|BetweenVerizonal|ListTree|ListOrdered|List|Menu|MoreHorizontal|MoreVertical|Ellipsis|EllipsisVertical|Layers|Stack|Grip|GripHorizontal|GripVertical|Flip|Frame|Group|Ungroup|Maximize|Minimize|PanelLeft|PanelRight|PanelTop|PanelBottom)/ },

  /* 状态 / 标识 / 警告 / 锁 */
  { cat: 'status', test: /^(Check|XCircle|XSquare|XIcon|Ban|Slash|Lock|Unlock|Shield|Badge|Tag|Tags|Eye|Pin|Verified|AlertCircle|AlertTriangle|AlertOctagon|TriangleAlert|OctagonAlert|ShieldAlert|ShieldCheck|ShieldOff|ShieldX|CircleAlert|CircleCheck|CircleX|CircleSlash|CircleHelp|Loader|Spinner|Done|Cancel|Confirm|Biohazard|Radiation|Ban|Octagon|Hexagon|HelpCircle)/ },

  /* 设备 / 硬件 / 通讯端口 */
  { cat: 'device', test: /^(Cpu|Server|HardDrive|Monitor|Smartphone|Laptop|Tablet|Mouse|Keyboard|Printer|Scanner|Webcam|Wifi|Bluetooth|Battery|Plug|Cable|Usb|Hdmi|SdCard|Memory|Network|Router|Cast|Airplay|Joystick|Gamepad|Antenna|Satellite|Radar|Computer|PcCase|Microchip|Disc|Webhook|Nfc|AppWindow|Signal|Scan(?!ner)|ScanLine|ScanText|ScanFace|ScanBarcode|ScanQrCode|ScanEye|ScanHeart|ScanSearch|QrCode|Barcode|Fingerprint)/ },

  /* 几何 / 形状 / 符号 */
  { cat: 'shape', test: /^(Circle|Triangle|Pentagon|Diamond|Shapes|Cuboid|Cylinder|Cone|Pyramid|Torus|Asterisk|Equal|Divide|Plus|Minus|Dot|Box|Boxes|Origami|Cube|Squircle|Pi|Infinity|Omega|Anchor)/ },

  /* 天气 / 自然 / 动植物 */
  { cat: 'nature', test: /^(Sun|Moon|Cloud|Rain|Snow|Wind|Storm|Lightning|Thunder|Earth|Globe|Mountain|Tree|Leaf|Leafy|Flower|Sprout|Cherry|Carrot|Banana|Apple|Cat|Dog|Bird|Fish|Bug|Rat|Rabbit|Snail|Squirrel|Turtle|Deer|Panda|Worm|Shell|Tornado|Rainbow|Haze|Volcano|PalmTree|Palmtree|Wheat|Vines|Shrub|Sunrise|Sunset|Droplet|Droplets|Bone|PawPrint|Atom|Dna|Microscope|Telescope|Flame|Fire|Citrus|Grape|Egg|Feather|Footprints|Bean|Sparkles)/ },

  /* 食物 / 饮品 */
  { cat: 'food', test: /^(Coffee|Beer|Wine|Pizza|Cake|Cookie|Donut|Soup|Salad|Sandwich|IceCream|Popsicle|Popcorn|Croissant|Cherries|Beef|Ham|Egg|Milk|Bread|Burger|Hotdog|Lollipop|Candy|Cocktail|Martini|Tea|Drumstick|Utensils|Vegan|GlassWater|CupSoda|MilkOff|Dessert|Cookie|Salt|Wheat|Cannabis|Carrot)/ },

  /* 交通 / 工具 */
  { cat: 'transport', test: /^(Car|Bus|Train|Plane|Ship|Bike|Bicycle|Truck|Tractor|Forklift|Ambulance|Helicopter|Sailboat|Rocket|Tram|Scooter|Skateboard|Cabin|RailSymbol|Fuel|Caravan|Construction|TrafficCone|ParkingSquare|ParkingMeter|RollerCoaster|FerrisWheel)/ },

  /* 建筑 / 场所 / 家具 */
  { cat: 'building', test: /^(Building|House|Home|Hospital|Hotel|School|Store|Church|Castle|Factory|Warehouse|Landplot|Tent|Lighthouse|Tower|Garage|Dam|UtilityPole|Bed|Bath|Sofa|Armchair|Chair|Lamp|Door|Fence|Wall|Brick|Sofa|Lamp|Toilet|Refrigerator|Washing|Microwave|Coffee|Heater|BookCase)/ },

  /* 文件 / 文档 / 书籍 */
  { cat: 'file', test: /^(File|Folder|Page|Document|Archive|Notebook|Notepad|StickyNote|Scroll|Newspaper|Book|Clipboard|Receipt|FileText|Page)/ },

  /* 用户 / 人物 */
  { cat: 'people', test: /^(User|Users|Person|Baby|Bot|Contact|PersonStanding|Footprints|Hand|Handshake|Brain|Eye|Ear|Glasses|HatGlasses|Fingerprint|Paw|Mars|Venus|Transgender|Accessibility|BicepsFlexed|Wheelchair|Speech)/ },

  /* 设置 / 工具(catch 工具类剩余) */
  { cat: 'tool', test: /^(Settings|Cog|Wrench|Hammer|Screwdriver|Drill|Saw|Axe|Anvil|Magnet|Ruler|Scissors|Lasso|Pickaxe|Toolbox|Toolkit|PenTool|Construction|Bandage|Beaker|Flask|TestTube|TestTubes|Stethoscope|Syringe|Pipette|Thermometer|Trash|Bin|Recycle|Paint|Palette|Wand|Sword|Swords|Bow|Bomb|Gem|Search|Filter|Funnel|Edit|Save|Download|Upload|Share|Link|Unlink|Copy|Cut|Paste|Expand|Shrink|Fold|Unfold|Sliders|Slider|Toggle|Power|Zap|Key|Keyhole|Package|Boxes|Chess|Dice|Joystick|Flashlight|Lightbulb|Briefcase|Backpack|Umbrella|UmbrellaOff|Wallet|Glasses|HatGlasses|Diamond|Spool|Scaling|Move3d|Combine|Origami|Spade|Heart|HelpingHand)/ },
];

/* ────────── 分类函数 ────────── */

const FAV_SET = new Set(FAVORITES);

/** 一个图标 → 一个分类 id */
export function classify(name: string): CategoryId {
  if (FAV_SET.has(name)) return 'fav';
  for (const r of RULES) {
    if (r.test.test(name)) return r.cat;
  }
  return 'other';
}

/**
 * 把所有图标名按分类分组,返回 Map<CategoryId, string[]>。
 * 常用:按 FAVORITES 顺序(精心排好)
 * 其他:按字母顺序
 */
export function groupByCategory(allNames: string[]): Map<CategoryId, string[]> {
  const result = new Map<CategoryId, string[]>();
  CATEGORIES.forEach((c) => result.set(c.id, []));

  // 常用按预定义顺序入库(过滤掉 lucide 没有的项)
  result.set(
    'fav',
    FAVORITES.filter((n) => allNames.includes(n)),
  );

  // 其他类按 classify 结果归位
  for (const name of allNames) {
    if (FAV_SET.has(name)) continue; // 已在 fav 里
    const catId = classify(name);
    result.get(catId)!.push(name);
  }

  return result;
}

/** 返回常用图标 + ICON_ZH 翻译(便于在 UI 上展示) */
export function favoriteWithZh(): { name: string; zh: string }[] {
  return FAVORITES.map((n) => ({ name: n, zh: ICON_ZH[n] || n }));
}
