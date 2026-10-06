// VM sizes SevenThirty prices. Specs only: rates come from the snapshot.
// Add a size here and the pricing job will pick it up on its next run.

export interface VmSku {
  /** ARM SKU name as used in the portal and Terraform. */
  name: string
  family: string
  vcpu: number
  memGb: number
  /** Short friendly description shown beside the ARM name. */
  note: string
}

const sku = (name: string, family: string, vcpu: number, memGb: number, note: string): VmSku => ({
  name,
  family,
  vcpu,
  memGb,
  note,
})

export const VM_SKUS: VmSku[] = [
  sku('Standard_B2s', 'Bs', 2, 4, 'Burstable'),
  sku('Standard_B2ms', 'Bs', 2, 8, 'Burstable'),
  sku('Standard_B4ms', 'Bs', 4, 16, 'Burstable'),
  sku('Standard_B2als_v2', 'Basv2', 2, 4, 'Burstable, AMD'),
  sku('Standard_B2as_v2', 'Basv2', 2, 8, 'Burstable, AMD'),
  sku('Standard_B4as_v2', 'Basv2', 4, 16, 'Burstable, AMD'),
  sku('Standard_D2s_v5', 'Dsv5', 2, 8, 'General purpose'),
  sku('Standard_D4s_v5', 'Dsv5', 4, 16, 'General purpose'),
  sku('Standard_D8s_v5', 'Dsv5', 8, 32, 'General purpose'),
  sku('Standard_D16s_v5', 'Dsv5', 16, 64, 'General purpose'),
  sku('Standard_D32s_v5', 'Dsv5', 32, 128, 'General purpose'),
  sku('Standard_D2as_v5', 'Dasv5', 2, 8, 'General purpose, AMD'),
  sku('Standard_D4as_v5', 'Dasv5', 4, 16, 'General purpose, AMD'),
  sku('Standard_D8as_v5', 'Dasv5', 8, 32, 'General purpose, AMD'),
  sku('Standard_D16as_v5', 'Dasv5', 16, 64, 'General purpose, AMD'),
  sku('Standard_D2ds_v5', 'Ddsv5', 2, 8, 'General purpose, local disk'),
  sku('Standard_D4ds_v5', 'Ddsv5', 4, 16, 'General purpose, local disk'),
  sku('Standard_D8ds_v5', 'Ddsv5', 8, 32, 'General purpose, local disk'),
  sku('Standard_E2s_v5', 'Esv5', 2, 16, 'Memory optimised'),
  sku('Standard_E4s_v5', 'Esv5', 4, 32, 'Memory optimised'),
  sku('Standard_E8s_v5', 'Esv5', 8, 64, 'Memory optimised'),
  sku('Standard_E16s_v5', 'Esv5', 16, 128, 'Memory optimised'),
  sku('Standard_E32s_v5', 'Esv5', 32, 256, 'Memory optimised'),
  sku('Standard_E2as_v5', 'Easv5', 2, 16, 'Memory optimised, AMD'),
  sku('Standard_E4as_v5', 'Easv5', 4, 32, 'Memory optimised, AMD'),
  sku('Standard_E8as_v5', 'Easv5', 8, 64, 'Memory optimised, AMD'),
  sku('Standard_F2s_v2', 'Fsv2', 2, 4, 'Compute optimised'),
  sku('Standard_F4s_v2', 'Fsv2', 4, 8, 'Compute optimised'),
  sku('Standard_F8s_v2', 'Fsv2', 8, 16, 'Compute optimised'),
  sku('Standard_F16s_v2', 'Fsv2', 16, 32, 'Compute optimised'),
]

export function findVmSku(name: string): VmSku | undefined {
  return VM_SKUS.find((s) => s.name === name)
}
