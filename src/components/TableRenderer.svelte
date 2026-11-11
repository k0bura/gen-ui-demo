<script lang="ts">
  import type { TableData } from "../demo/types";

  interface Props {
    data: TableData;
  }

  let { data }: Props = $props();

  // A column is numeric when every cell in it is a number. Numeric columns
  // align right so the digits line up; the model does not decide this.
  const numeric = $derived(
    data.columns.map((_, i) => data.rows.every((r) => typeof r[i] === "number")),
  );
</script>

<sl-card class="gen-figure">
  {#if data.title}
    <div slot="header" data-role="card-title" class="gx-type-heading-02">{data.title}</div>
  {/if}
  <div class="table-scroll">
    <table class="gen-table">
      <thead>
        <tr>
          {#each data.columns as col, i (i)}
            <th scope="col" class:num={numeric[i]}>{col}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each data.rows as row, r (r)}
          <tr>
            {#each data.columns as _, i (i)}
              <td class:num={numeric[i]}>{row[i] ?? ""}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if data.caption}
    <div class="gx-type-label-01 figure-note">{data.caption}</div>
  {/if}
</sl-card>

<style>
  .table-scroll {
    overflow-x: auto;
  }
  .figure-note {
    display: block;
    width: 100%;
    margin: var(--space-3) 0 0;
  }
</style>
