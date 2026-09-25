<script lang="ts">
  import type { Component } from "svelte";
  import Activity from "@lucide/svelte/icons/activity";
  import AlarmClock from "@lucide/svelte/icons/alarm-clock";
  import Archive from "@lucide/svelte/icons/archive";
  import Armchair from "@lucide/svelte/icons/armchair";
  import ArrowLeftRight from "@lucide/svelte/icons/arrow-left-right";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
  import Award from "@lucide/svelte/icons/award";
  import Baby from "@lucide/svelte/icons/baby";
  import Banknote from "@lucide/svelte/icons/banknote";
  import BedDouble from "@lucide/svelte/icons/bed-double";
  import BookA from "@lucide/svelte/icons/book-a";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Box from "@lucide/svelte/icons/box";
  import Brain from "@lucide/svelte/icons/brain";
  import BrickWall from "@lucide/svelte/icons/brick-wall";
  import Briefcase from "@lucide/svelte/icons/briefcase";
  import Brush from "@lucide/svelte/icons/brush";
  import Building from "@lucide/svelte/icons/building";
  import Building2 from "@lucide/svelte/icons/building-2";
  import Calculator from "@lucide/svelte/icons/calculator";
  import Calendar from "@lucide/svelte/icons/calendar";
  import CalendarCheck from "@lucide/svelte/icons/calendar-check";
  import CalendarFold from "@lucide/svelte/icons/calendar-fold";
  import CalendarRange from "@lucide/svelte/icons/calendar-range";
  import Candy from "@lucide/svelte/icons/candy";
  import Car from "@lucide/svelte/icons/car";
  import Carrot from "@lucide/svelte/icons/carrot";
  import ChartBar from "@lucide/svelte/icons/chart-bar";
  import CircleDot from "@lucide/svelte/icons/circle-dot";
  import CircleQuestionMark from "@lucide/svelte/icons/circle-question-mark";
  import Clock from "@lucide/svelte/icons/clock";
  import Cloud from "@lucide/svelte/icons/cloud";
  import CloudSun from "@lucide/svelte/icons/cloud-sun";
  import Coffee from "@lucide/svelte/icons/coffee";
  import Compass from "@lucide/svelte/icons/compass";
  import Cookie from "@lucide/svelte/icons/cookie";
  import CupSoda from "@lucide/svelte/icons/cup-soda";
  import DoorOpen from "@lucide/svelte/icons/door-open";
  import Drama from "@lucide/svelte/icons/drama";
  import Ear from "@lucide/svelte/icons/ear";
  import Earth from "@lucide/svelte/icons/earth";
  import Egg from "@lucide/svelte/icons/egg";
  import Factory from "@lucide/svelte/icons/factory";
  import Feather from "@lucide/svelte/icons/feather";
  import Flag from "@lucide/svelte/icons/flag";
  import Flame from "@lucide/svelte/icons/flame";
  import Flower2 from "@lucide/svelte/icons/flower-2";
  import Footprints from "@lucide/svelte/icons/footprints";
  import ForkKnife from "@lucide/svelte/icons/fork-knife";
  import Gamepad2 from "@lucide/svelte/icons/gamepad-2";
  import Gauge from "@lucide/svelte/icons/gauge";
  import Gavel from "@lucide/svelte/icons/gavel";
  import Glasses from "@lucide/svelte/icons/glasses";
  import Globe from "@lucide/svelte/icons/globe";
  import Grab from "@lucide/svelte/icons/grab";
  import GraduationCap from "@lucide/svelte/icons/graduation-cap";
  import Hand from "@lucide/svelte/icons/hand";
  import Handshake from "@lucide/svelte/icons/handshake";
  import Hash from "@lucide/svelte/icons/hash";
  import HatGlasses from "@lucide/svelte/icons/hat-glasses";
  import Heart from "@lucide/svelte/icons/heart";
  import HeartHandshake from "@lucide/svelte/icons/heart-handshake";
  import HeartPulse from "@lucide/svelte/icons/heart-pulse";
  import Hourglass from "@lucide/svelte/icons/hourglass";
  import House from "@lucide/svelte/icons/house";
  import HouseHeart from "@lucide/svelte/icons/house-heart";
  import IdCard from "@lucide/svelte/icons/id-card";
  import Info from "@lucide/svelte/icons/info";
  import Landmark from "@lucide/svelte/icons/landmark";
  import Languages from "@lucide/svelte/icons/languages";
  import Layers from "@lucide/svelte/icons/layers";
  import Lightbulb from "@lucide/svelte/icons/lightbulb";
  import Link from "@lucide/svelte/icons/link";
  import ListOrdered from "@lucide/svelte/icons/list-ordered";
  import Luggage from "@lucide/svelte/icons/luggage";
  import Mail from "@lucide/svelte/icons/mail";
  import MapPin from "@lucide/svelte/icons/map-pin";
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import MessageCircleHeart from "@lucide/svelte/icons/message-circle-heart";
  import MessageSquare from "@lucide/svelte/icons/message-square";
  import Milestone from "@lucide/svelte/icons/milestone";
  import Moon from "@lucide/svelte/icons/moon";
  import Mountain from "@lucide/svelte/icons/mountain";
  import Move from "@lucide/svelte/icons/move";
  import Music from "@lucide/svelte/icons/music";
  import Newspaper from "@lucide/svelte/icons/newspaper";
  import NotebookPen from "@lucide/svelte/icons/notebook-pen";
  import Package from "@lucide/svelte/icons/package";
  import Palette from "@lucide/svelte/icons/palette";
  import PartyPopper from "@lucide/svelte/icons/party-popper";
  import PawPrint from "@lucide/svelte/icons/paw-print";
  import PenLine from "@lucide/svelte/icons/pen-line";
  import Pencil from "@lucide/svelte/icons/pencil";
  import PersonStanding from "@lucide/svelte/icons/person-standing";
  import PiggyBank from "@lucide/svelte/icons/piggy-bank";
  import Plane from "@lucide/svelte/icons/plane";
  import Pointer from "@lucide/svelte/icons/pointer";
  import Puzzle from "@lucide/svelte/icons/puzzle";
  import Quote from "@lucide/svelte/icons/quote";
  import Rabbit from "@lucide/svelte/icons/rabbit";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Repeat from "@lucide/svelte/icons/repeat";
  import Ruler from "@lucide/svelte/icons/ruler";
  import Sandwich from "@lucide/svelte/icons/sandwich";
  import Scale from "@lucide/svelte/icons/scale";
  import School from "@lucide/svelte/icons/school";
  import Scroll from "@lucide/svelte/icons/scroll";
  import ScrollText from "@lucide/svelte/icons/scroll-text";
  import Shapes from "@lucide/svelte/icons/shapes";
  import Shirt from "@lucide/svelte/icons/shirt";
  import ShoppingCart from "@lucide/svelte/icons/shopping-cart";
  import Signpost from "@lucide/svelte/icons/signpost";
  import Siren from "@lucide/svelte/icons/siren";
  import Smartphone from "@lucide/svelte/icons/smartphone";
  import Smile from "@lucide/svelte/icons/smile";
  import Snowflake from "@lucide/svelte/icons/snowflake";
  import Soup from "@lucide/svelte/icons/soup";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Speech from "@lucide/svelte/icons/speech";
  import SportShoe from "@lucide/svelte/icons/sport-shoe";
  import SprayCan from "@lucide/svelte/icons/spray-can";
  import Star from "@lucide/svelte/icons/star";
  import StepForward from "@lucide/svelte/icons/step-forward";
  import Store from "@lucide/svelte/icons/store";
  import Sun from "@lucide/svelte/icons/sun";
  import Sunset from "@lucide/svelte/icons/sunset";
  import Tag from "@lucide/svelte/icons/tag";
  import Tally5 from "@lucide/svelte/icons/tally-5";
  import Thermometer from "@lucide/svelte/icons/thermometer";
  import Ticket from "@lucide/svelte/icons/ticket";
  import Timer from "@lucide/svelte/icons/timer";
  import TrainFront from "@lucide/svelte/icons/train-front";
  import Trees from "@lucide/svelte/icons/trees";
  import Trophy from "@lucide/svelte/icons/trophy";
  import UserPlus from "@lucide/svelte/icons/user-plus";
  import UserRound from "@lucide/svelte/icons/user-round";
  import UserRoundCheck from "@lucide/svelte/icons/user-round-check";
  import Users from "@lucide/svelte/icons/users";
  import UtensilsCrossed from "@lucide/svelte/icons/utensils-crossed";
  import VenetianMask from "@lucide/svelte/icons/venetian-mask";
  import Wallet from "@lucide/svelte/icons/wallet";
  import Wand from "@lucide/svelte/icons/wand";
  import WashingMachine from "@lucide/svelte/icons/washing-machine";
  import Weight from "@lucide/svelte/icons/weight";
  import Wrench from "@lucide/svelte/icons/wrench";
  import Zap from "@lucide/svelte/icons/zap";
  import type { SetId, SubcategoryId } from "../../content/sets";

  const SET_ICONS: Record<SetId, Component> = {
    numbers: Hash,
    calendar: Calendar,
    time: Clock,
    position: Move,
    people: Users,
    body: PersonStanding,
    mind: Brain,
    language: MessageSquare,
    home: House,
    food: UtensilsCrossed,
    clothing: Shirt,
    objects: Package,
    money: Wallet,
    "school-work": GraduationCap,
    places: MapPin,
    travel: Plane,
    nature: Trees,
    leisure: Ticket,
    society: Scale,
    concepts: Lightbulb,
    actions: Activity,
    describing: Sparkles,
    expressions: Quote
  };

  const SUBCATEGORY_ICONS: Record<SubcategoryId, Component> = {
    digits: Calculator,
    counters: Tally5,
    units: Weight,
    quantity: Layers,
    order: ListOrdered,
    frequency: Repeat,
    weekdays: CalendarCheck,
    days: Sun,
    weeks: CalendarRange,
    months: Moon,
    years: CalendarFold,
    seasons: Snowflake,
    events: PartyPopper,
    clock: AlarmClock,
    "day-parts": Sunset,
    duration: Hourglass,
    moments: Timer,
    sequence: StepForward,
    spatial: ArrowUpDown,
    compass: Compass,
    distance: Milestone,
    shape: Shapes,
    family: HouseHeart,
    pronouns: Pointer,
    "person-types": UserRound,
    roles: UserRoundCheck,
    social: Handshake,
    nationality: Flag,
    counts: UserPlus,
    identity: IdCard,
    "body-parts": Hand,
    senses: Ear,
    health: HeartPulse,
    "life-cycle": Baby,
    feelings: Smile,
    thinking: Brain,
    preference: Heart,
    character: VenetianMask,
    speaking: MessageCircle,
    reading: BookOpen,
    writing: PenLine,
    languages: Languages,
    mail: Mail,
    rooms: BedDouble,
    furniture: Armchair,
    appliances: WashingMachine,
    housework: SprayCan,
    routine: Coffee,
    meals: Soup,
    ingredients: Egg,
    produce: Carrot,
    drinks: CupSoda,
    sweets: Candy,
    tableware: ForkKnife,
    eating: Sandwich,
    taste: Cookie,
    garments: Shirt,
    footwear: SportShoe,
    accessories: Glasses,
    wearing: HatGlasses,
    stationery: Pencil,
    tools: Wrench,
    containers: Archive,
    devices: Smartphone,
    materials: BrickWall,
    money: Banknote,
    shopping: ShoppingCart,
    prices: Tag,
    finance: PiggyBank,
    school: School,
    study: NotebookPen,
    subjects: BookA,
    work: Briefcase,
    industry: Factory,
    buildings: Building,
    shops: Store,
    "building-parts": DoorOpen,
    town: Building2,
    regions: Globe,
    vehicles: Car,
    stations: TrainFront,
    navigation: Signpost,
    trips: Luggage,
    weather: CloudSun,
    sky: Cloud,
    landscape: Mountain,
    plants: Flower2,
    animals: PawPrint,
    elements: Flame,
    music: Music,
    arts: Brush,
    sports: Trophy,
    play: Gamepad2,
    government: Landmark,
    law: Gavel,
    media: Newspaper,
    culture: Drama,
    incidents: Siren,
    international: Earth,
    things: Box,
    questions: CircleQuestionMark,
    relations: Link,
    cause: Zap,
    change: RefreshCw,
    method: Wand,
    state: Info,
    movement: Footprints,
    transfer: ArrowLeftRight,
    handling: Grab,
    existence: CircleDot,
    size: Ruler,
    colors: Palette,
    quality: Star,
    condition: Gauge,
    speed: Rabbit,
    temperature: Thermometer,
    difficulty: Puzzle,
    skill: Award,
    degree: ChartBar,
    manner: Feather,
    greetings: MessageCircleHeart,
    courtesy: HeartHandshake,
    "set-phrases": Speech,
    idioms: ScrollText,
    yojijukugo: Scroll
  };

  let {
    set,
    subcategory,
    class: className = "size-4"
  }: { set: SetId; subcategory?: string; class?: string } = $props();

  const Glyph = $derived(
    (subcategory === undefined ? undefined : SUBCATEGORY_ICONS[subcategory as SubcategoryId]) ??
      SET_ICONS[set]
  );
</script>

<Glyph class={className} strokeWidth={1.8} aria-hidden="true" />
