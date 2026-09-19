<script lang="ts">
  import { Button, Card, PageBackdrop } from "kaizen-ui";

  let runs = $state(0);
</script>

<PageBackdrop />

<main class="relative z-10 mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-6">
  <Card title="Kanji Trainer" description="Skeleton app. Nothing is implemented yet.">
    <p class="text-sm text-muted-foreground">Placeholder runs configured: {runs}</p>
    <Button onclick={() => (runs += 1)}>Count a run</Button>
  </Card>
</main>
