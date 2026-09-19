<script lang="ts">
  import { ConfirmDialog } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { t } from "../../i18n.svelte";
</script>

<ConfirmDialog
  title={t("quiz.quitTitle")}
  confirmLabel={t("quiz.quitConfirm")}
  cancelLabel={t("quiz.quitCancel")}
  closeLabel={t("common.close")}
  onconfirm={() => app.quit()}
  oncancel={() => (app.confirmQuit = false)}
>
  {t("quiz.quitBody")}
</ConfirmDialog>
