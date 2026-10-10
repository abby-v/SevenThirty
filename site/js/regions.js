// SevenThirty: Azure regions and the billing zones used for global services.
const REGIONS=[["uksouth","UK South"],["ukwest","UK West"],["northeurope","North Europe"],["westeurope","West Europe"],["francecentral","France Central"],["germanywestcentral","Germany West Central"],
 ["swedencentral","Sweden Central"],["switzerlandnorth","Switzerland North"],["norwayeast","Norway East"],["italynorth","Italy North"],["spaincentral","Spain Central"],["polandcentral","Poland Central"],
 ["eastus","East US"],["eastus2","East US 2"],["centralus","Central US"],["westus2","West US 2"],["westus3","West US 3"],["southcentralus","South Central US"],["canadacentral","Canada Central"],["brazilsouth","Brazil South"],
 ["uaenorth","UAE North"],["qatarcentral","Qatar Central"],["israelcentral","Israel Central"],["southafricanorth","South Africa North"],["centralindia","Central India"],
 ["southeastasia","Southeast Asia"],["eastasia","East Asia"],["japaneast","Japan East"],["koreacentral","Korea Central"],["australiaeast","Australia East"],["newzealandnorth","New Zealand North"]];
const regionName=id=>(REGIONS.find(r=>r[0]===id)||[id,id])[1];
function zoneOf(id){
  if(/asia|japan|korea|australia|india|newzealand/.test(id))return "Zone 2";
  if(/brazil/.test(id))return "Zone 3";
  if(/^(uk|north|west|france|germany|sweden|switzerland|norway|italy|spain|poland|east|central|south|canada)/.test(id)&&!/africa/.test(id))return "Zone 1";
  return null;
}

export { REGIONS, regionName, zoneOf };
