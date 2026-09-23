<script lang="ts">
  import type { Component } from "svelte";
  import Activity from "@lucide/svelte/icons/activity";
  import AlarmClock from "@lucide/svelte/icons/alarm-clock";
  import Armchair from "@lucide/svelte/icons/armchair";
  import ArrowLeftRight from "@lucide/svelte/icons/arrow-left-right";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
  import Award from "@lucide/svelte/icons/award";
  import Banknote from "@lucide/svelte/icons/banknote";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Building from "@lucide/svelte/icons/building";
  import Cake from "@lucide/svelte/icons/cake";
  import Calculator from "@lucide/svelte/icons/calculator";
  import Calendar from "@lucide/svelte/icons/calendar";
  import CalendarCheck from "@lucide/svelte/icons/calendar-check";
  import CalendarFold from "@lucide/svelte/icons/calendar-fold";
  import CalendarRange from "@lucide/svelte/icons/calendar-range";
  import Candy from "@lucide/svelte/icons/candy";
  import Clock from "@lucide/svelte/icons/clock";
  import CloudSun from "@lucide/svelte/icons/cloud-sun";
  import Coffee from "@lucide/svelte/icons/coffee";
  import Compass from "@lucide/svelte/icons/compass";
  import DoorOpen from "@lucide/svelte/icons/door-open";
  import Ear from "@lucide/svelte/icons/ear";
  import Eye from "@lucide/svelte/icons/eye";
  import Feather from "@lucide/svelte/icons/feather";
  import Flag from "@lucide/svelte/icons/flag";
  import Flame from "@lucide/svelte/icons/flame";
  import Flower2 from "@lucide/svelte/icons/flower-2";
  import Footprints from "@lucide/svelte/icons/footprints";
  import Gauge from "@lucide/svelte/icons/gauge";
  import Gem from "@lucide/svelte/icons/gem";
  import Globe from "@lucide/svelte/icons/globe";
  import GraduationCap from "@lucide/svelte/icons/graduation-cap";
  import Hand from "@lucide/svelte/icons/hand";
  import Handshake from "@lucide/svelte/icons/handshake";
  import Hash from "@lucide/svelte/icons/hash";
  import HeartPulse from "@lucide/svelte/icons/heart-pulse";
  import Hourglass from "@lucide/svelte/icons/hourglass";
  import HouseHeart from "@lucide/svelte/icons/house-heart";
  import IdCard from "@lucide/svelte/icons/id-card";
  import Lamp from "@lucide/svelte/icons/lamp";
  import Languages from "@lucide/svelte/icons/languages";
  import MapPin from "@lucide/svelte/icons/map-pin";
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import Milestone from "@lucide/svelte/icons/milestone";
  import Moon from "@lucide/svelte/icons/moon";
  import Mountain from "@lucide/svelte/icons/mountain";
  import Move from "@lucide/svelte/icons/move";
  import Package from "@lucide/svelte/icons/package";
  import Palette from "@lucide/svelte/icons/palette";
  import PartyPopper from "@lucide/svelte/icons/party-popper";
  import PenLine from "@lucide/svelte/icons/pen-line";
  import Pencil from "@lucide/svelte/icons/pencil";
  import PersonStanding from "@lucide/svelte/icons/person-standing";
  import Plane from "@lucide/svelte/icons/plane";
  import Repeat from "@lucide/svelte/icons/repeat";
  import Ruler from "@lucide/svelte/icons/ruler";
  import Shirt from "@lucide/svelte/icons/shirt";
  import Soup from "@lucide/svelte/icons/soup";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import StepForward from "@lucide/svelte/icons/step-forward";
  import Sun from "@lucide/svelte/icons/sun";
  import Sunset from "@lucide/svelte/icons/sunset";
  import Tally5 from "@lucide/svelte/icons/tally-5";
  import Timer from "@lucide/svelte/icons/timer";
  import TrainFront from "@lucide/svelte/icons/train-front";
  import Trees from "@lucide/svelte/icons/trees";
  import UserPlus from "@lucide/svelte/icons/user-plus";
  import UserRound from "@lucide/svelte/icons/user-round";
  import Users from "@lucide/svelte/icons/users";
  import UtensilsCrossed from "@lucide/svelte/icons/utensils-crossed";
  import { SUBCATEGORIES, type SetId } from "../../content/sets";

  type SubcategoryId = (typeof SUBCATEGORIES)[SetId][number];

  const SET_ICONS: Record<SetId, Component> = {
    numbers: Hash,
    calendar: Calendar,
    time: Clock,
    people: Users,
    position: Move,
    body: PersonStanding,
    actions: Activity,
    places: MapPin,
    nature: Trees,
    describing: Sparkles,
    objects: Package,
    food: UtensilsCrossed
  };

  const SUBCATEGORY_ICONS: Record<SubcategoryId, Component> = {
    digits: Calculator,
    counters: Tally5,
    frequency: Repeat,
    weekdays: CalendarCheck,
    days: Sun,
    weeks: CalendarRange,
    months: Moon,
    years: CalendarFold,
    events: PartyPopper,
    age: Cake,
    clock: AlarmClock,
    duration: Hourglass,
    "day-parts": Sunset,
    moments: Timer,
    family: HouseHeart,
    "person-types": UserRound,
    "school-roles": GraduationCap,
    social: Handshake,
    nationality: Flag,
    counts: UserPlus,
    identity: IdCard,
    compass: Compass,
    spatial: ArrowUpDown,
    sequence: StepForward,
    "body-parts": Hand,
    senses: Ear,
    health: HeartPulse,
    movement: Footprints,
    transfer: ArrowLeftRight,
    communication: MessageCircle,
    perception: Eye,
    literacy: PenLine,
    "daily-routine": Coffee,
    "life-events": Milestone,
    buildings: Building,
    "building-parts": DoorOpen,
    transport: TrainFront,
    geography: Globe,
    travel: Plane,
    landscape: Mountain,
    weather: CloudSun,
    plants: Flower2,
    elements: Flame,
    size: Ruler,
    colors: Palette,
    skill: Award,
    condition: Gauge,
    value: Gem,
    manner: Feather,
    languages: Languages,
    clothing: Shirt,
    stationery: Pencil,
    "reading-material": BookOpen,
    furniture: Armchair,
    money: Banknote,
    household: Lamp,
    general: Soup,
    sweets: Candy
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
