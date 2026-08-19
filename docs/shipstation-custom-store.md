# ShipStation Custom Store Development Guide

Reference notes for building a **Custom Store** endpoint that ShipStation can talk to. A Custom
Store is ShipStation's escape hatch for order sources that have no pre-built integration: you
expose one web endpoint that speaks XML, and ShipStation both pulls orders from it and pushes
shipment/tracking updates back to it.

> Source: ShipStation Help Center — *Custom Store Development Guide* (Integrations Help Guide →
> Advanced Integration Methods). Transcribed here for offline reference; verify against the live
> article before shipping an implementation.

**Status in this repo:** the Custom Store is **the order channel we are building on**. As of
2026-08-19 orders go out and shipment notices come back through this feed; the ShipStation V2 API
keeps catalogue, inventory and warehouses. See `src/lib/shipstation/CLAUDE.md` § "Two channels" for
the split, and [How this maps to our implementation](#how-this-maps-to-our-implementation) at the
bottom for the spec-to-code map. **This document is the contract** — where our implementation and
this spec disagree, the spec wins.

---

## 1. How it works

You expose a **single web endpoint** (one URL) that returns XML. That endpoint handles two
operations, distinguished by the `action` query parameter:

| Operation | HTTP | `action` | Direction | Purpose |
|---|---|---|---|---|
| Export | `GET` | `export` | ShipStation → your store | Pull order info (recipient address, products, customer, etc.) |
| Ship notify | `POST` | `shipnotify` | ShipStation → your store | Push shipment info back when a label is created (carrier, service, tracking number, cost) |

Your endpoint must branch on `action` and handle both. Everything else — paging, statuses,
authentication — is layered on top of those two calls.

### Prerequisites

ShipStation flags this as requiring **advanced development skills**. Their support for Custom
Stores is limited: if setup errors occur, support can give insight into the failure but you or
your developer take the corrective action.

### Authentication

ShipStation uses **Basic HTTP Authentication** when calling your endpoint. Credentials are passed
in a standard `Authorization: Basic <base64(user:pass)>` header. Your endpoint must validate them
on every request — both GET and POST.

HTTPS is strongly recommended (Basic auth over plaintext HTTP leaks the credentials).

---

## 2. The GET call (order export)

ShipStation requests order information from your endpoint. You must render XML matching the
schema in §5.

### URL format

```
[Your Web Endpoint]?action=export&start_date=[Start Date]&end_date=[End Date]&page=1
```

URL-encoded in practice:

```
https://www.yourstore.com/shipstationxml.php?action=export&start_date=01%2f23%2f2012+17%3a28&end_date=01%2f23%2f2012+17%3a33&page=1
```

### Query parameters

| Parameter | Description |
|---|---|
| `action` | Always `export` when ShipStation is requesting order information. |
| `start_date` | Start date in **UTC**. Format: `MM/dd/yyyy HH:mm` (24-hour notation). Example: `03/23/2012 21:09` |
| `end_date` | End date in UTC. Same format as `start_date`. |
| `page` | Page number, starting at `1`. See [Paging](#paging). |

### What to return

Return **any order modified between `start_date` and `end_date`, regardless of the order's
status** — not just new orders, and not just unshipped ones. The window is on *last modified*,
not on order date.

All free-text fields should be wrapped in a `CDATA` section to avoid parsing errors. A CDATA
section starts with `<![CDATA[` and ends with `]]>`.

### Paging

For stores with hundreds or thousands of orders per day, page your results:

1. Pick a maximum number of records per reply.
2. Report the **total number of pages** in the `pages` attribute of the root `<Orders>` element.
3. ShipStation appends `&page=N` to each request. If `pages` indicates more pages exist,
   ShipStation requests subsequent pages until all orders have been retrieved.

```xml
<Orders pages="7">
```

### Example GET response body

```xml
<?xml version="1.0" encoding="utf-8"?>
<Orders pages="1">
  <Order>
    <OrderID><![CDATA[123456]]></OrderID>
    <OrderNumber><![CDATA[ABC123]]></OrderNumber>
    <OrderDate>10/18/2019 21:56 PM</OrderDate>
    <OrderStatus><![CDATA[paid]]></OrderStatus>
    <LastModified>12/8/2011 12:56 PM</LastModified>
    <ShippingMethod><![CDATA[USPSPriorityMail]]></ShippingMethod>
    <PaymentMethod><![CDATA[Credit Card]]></PaymentMethod>
    <CurrencyCode>EUR</CurrencyCode>
    <OrderTotal>123.45</OrderTotal>
    <TaxAmount>0.00</TaxAmount>
    <ShippingAmount>4.50</ShippingAmount>
    <CustomerNotes><![CDATA[Please make sure it gets here by Dec. 22nd!]]></CustomerNotes>
    <InternalNotes><![CDATA[Ship by December 18th via Priority Mail.]]></InternalNotes>
    <Gift>false</Gift>
    <GiftMessage></GiftMessage>
    <CustomField1></CustomField1>
    <CustomField2></CustomField2>
    <CustomField3></CustomField3>
    <Customer>
      <CustomerCode><![CDATA[customer@mystore.com]]></CustomerCode>
      <BillTo>
        <Name><![CDATA[The President]]></Name>
        <Company><![CDATA[US Govt]]></Company>
        <Phone><![CDATA[512-555-5555]]></Phone>
        <Email><![CDATA[customer@mystore.com]]></Email>
      </BillTo>
      <ShipTo>
        <Name><![CDATA[The President]]></Name>
        <Company><![CDATA[US Govt]]></Company>
        <Address1><![CDATA[1600 Pennsylvania Ave]]></Address1>
        <Address2></Address2>
        <City><![CDATA[Washington]]></City>
        <State><![CDATA[DC]]></State>
        <PostalCode><![CDATA[20500]]></PostalCode>
        <Country><![CDATA[US]]></Country>
        <Phone><![CDATA[512-555-5555]]></Phone>
      </ShipTo>
    </Customer>
    <Items>
      <Item>
        <SKU><![CDATA[FD88821]]></SKU>
        <Name><![CDATA[My Product Name]]></Name>
        <ImageUrl><![CDATA[http://www.mystore.com/products/12345.jpg]]></ImageUrl>
        <Weight>8</Weight>
        <WeightUnits>Ounces</WeightUnits>
        <Quantity>2</Quantity>
        <UnitPrice>13.99</UnitPrice>
        <UPC><![CDATA[UPC_VALUE]]></UPC>
        <Location><![CDATA[A1-B2]]></Location>
        <Options>
          <Option>
            <Name><![CDATA[Size]]></Name>
            <Value><![CDATA[Large]]></Value>
            <Weight>10</Weight>
          </Option>
          <Option>
            <Name><![CDATA[Color]]></Name>
            <Value><![CDATA[Green]]></Value>
            <Weight>5</Weight>
          </Option>
        </Options>
      </Item>
      <Item>
        <SKU></SKU>
        <Name><![CDATA[$10 OFF]]></Name>
        <Quantity>1</Quantity>
        <UnitPrice>-10.00</UnitPrice>
        <Adjustment>true</Adjustment>
      </Item>
    </Items>
  </Order>
</Orders>
```

Note the second `<Item>`: discounts and coupons are modeled as line items with
`<Adjustment>true</Adjustment>` and a **negative** `UnitPrice`.

---

## 3. The POST call (shipment notification)

When a label is created in ShipStation, ShipStation POSTs to the **same endpoint** with
`action=shipnotify` so your system can record that the order shipped.

Your endpoint must return a **200 (or any 2xx) HTTP status code** to indicate the tracking
information was received successfully.

Notifications fire:

- Automatically whenever a label is created (default behavior).
- On a delay, if the user configures **Notification options** in the Custom Store Settings window.
- When a user picks **Mark as Shipped** in ShipStation for labels created outside ShipStation —
  this moves the order to Shipped in ShipStation *and* posts the notification to your endpoint.

### Example POST request body

```xml
<?xml version="1.0" encoding="utf-8"?>
<ShipNotice>
  <OrderNumber>ABC123</OrderNumber>
  <OrderID>123456</OrderID>
  <CustomerCode>customer@mystore.com</CustomerCode>
  <CustomerNotes></CustomerNotes>
  <InternalNotes></InternalNotes>
  <NotesToCustomer></NotesToCustomer>
  <NotifyCustomer></NotifyCustomer>
  <LabelCreateDate>10/19/2019 12:56</LabelCreateDate>
  <ShipDate>10/19/2019</ShipDate>
  <Carrier>USPS</Carrier>
  <Service>Priority Mail</Service>
  <TrackingNumber>1Z909084330298430820</TrackingNumber>
  <ShippingCost>4.95</ShippingCost>
  <CustomField1></CustomField1>
  <CustomField2></CustomField2>
  <CustomField3></CustomField3>
  <Recipient>
    <Name>The President</Name>
    <Company>US Govt</Company>
    <Address1>1600 Pennsylvania Ave</Address1>
    <Address2></Address2>
    <City>Washington</City>
    <State>DC</State>
    <PostalCode>20500</PostalCode>
    <Country>US</Country>
  </Recipient>
  <Items>
    <Item>
      <SKU>FD88821</SKU>
      <Name>My Product Name</Name>
      <Quantity>2</Quantity>
      <LineItemID>25590</LineItemID>
      <UPC><![CDATA[UPC_VALUE]]></UPC>
    </Item>
  </Items>
</ShipNotice>
```

---

## 4. Connecting to ShipStation

Connecting a Custom Store works like adding any other direct store integration:

1. Go to **Account Settings**.
2. Select **Selling Channels** → **Store Setup**.
3. Click **Connect a Store or Marketplace**.
4. Choose the **Custom Store** option.
5. Fill in the form and click **Test Connection**.

### Connection form fields

| Field | Description |
|---|---|
| URL to custom XML Page | The location of your web endpoint. HTTPS recommended. |
| Unpaid Status | The status name in *your* system meaning an order is not yet paid and not ready to ship. Multiple statuses may be comma-separated. |
| Paid Status | The status name meaning paid and ready to ship. |
| Shipped Status | The status name meaning shipped. |
| Cancelled Status | The status name meaning cancelled. |
| On-Hold Status | The status name meaning on hold. |

The status fields map *your* `<OrderStatus>` values to ShipStation's statuses, which determines
where orders land in ShipStation. **These fields are case-sensitive.**

### Importing orders

ShipStation pulls orders with the GET call. Users can trigger an update manually via the import /
refresh icon (update all stores or an individual store), or enable **auto-update** so a store's
orders import periodically. Auto-update frequency depends on the user's history of manual updates
and other factors — it is not a fixed interval you can rely on.

---

## 5. Reference — order information fields

`*` indicates a required field.

| Name | XPath | Max allowed | Type | Length | Description |
|---|---|---|---|---|---|
| Orders `*` | `Orders` | 1 | Container | n/a | Root node |
| Order `*` | `Orders/Order` | Unlimited | Container | n/a | Container for an individual order |
| OrderID `*` | `Orders/Order/OrderID` | 1 per Order | String | n/a | Unique identifier for an order. Not displayed to anyone. |
| OrderNumber `*` | `Orders/Order/OrderNumber` | 1 per Order | String | 1…50 | User-visible order number. May be the same as OrderID. |
| OrderDate `*` | `Orders/Order/OrderDate` | 1 per Order | Date/time | 16 | Date the order was placed. Format `MM/dd/yyyy HH:mm`; 12- and 24-hour notation both allowed. Defaults to UTC if no time zone specified. |
| OrderStatus `*` | `Orders/Order/OrderStatus` | 1 per Order | String | 1…50 | Status of the order in your system. Mapped to a ShipStation status at connection time. |
| Dimensions | `Orders/Order/Dimensions` | 1 | Container | n/a | *(Optional)* Details about the order's package size |
| DimensionUnits | `Orders/Order/Dimensions/DimensionUnits` | 1 | String | 0–10 | `Inch` or `Centimeter` |
| Length | `Orders/Order/Dimensions/DimensionUnits/Length` | 1 | Decimal | 9,2 | Length of the package associated with this order |
| Width | `Orders/Order/Dimensions/DimensionUnits/Width` | 1 | Decimal | 9,2 | Width of the package associated with this order |
| Height | `Orders/Order/Dimensions/DimensionUnits/Height` | 1 | Decimal | 9,2 | Height of the package associated with this order |
| LastModified `*` | `Orders/Order/LastModified` | 1 per Order | Date/time | 16 | Last time the order was modified in your system. Format `MM/dd/yyyy HH:mm`. Defaults to UTC. |
| ShippingMethod | `Orders/Order/ShippingMethod` | 1 per Order | String | 0…100 | Recommended if known. ShipStation can map your shipping methods to actual services. |
| PaymentMethod | `Orders/Order/PaymentMethod` | 1 per Order | String | 0…50 | e.g. PayPal, Check, Money Order |
| CurrencyCode | `Orders/Order/CurrencyCode` | 1 per Order | String | 3 | ISO 4217 currency code (`USD`, `EUR`, …) |
| OrderTotal `*` | `Orders/Order/OrderTotal` | 1 per Order | Decimal | 9,2 | Total amount of the order. Nine total digits: up to 7 before the decimal, up to 2 after. |
| TaxAmount | `Orders/Order/TaxAmount` | 1 per Order | Decimal | 9,2 | Tax amount, if any |
| ShippingAmount `*` | `Orders/Order/ShippingAmount` | 1 per Order | Decimal | 9,2 | Shipping amount |
| CustomerNotes | `Orders/Order/CustomerNotes` | 1 per Order | String | 0…1000 | Notes left by the customer when placing the order |
| InternalNotes | `Orders/Order/InternalNotes` | 1 per Order | String | 0…1000 | Private notes viewed only by your company |
| Gift | `Orders/Order/Gift` | 1 per Order | Bool | | `true` if this order is a gift |
| GiftMessage | `Orders/Order/GiftMessage` | 1 per Order | String | 0…1000 | The customer's gift message |
| CustomField1 | `Orders/Order/CustomField1` | 1 per Order | String | 0…100 | Shows up in ShipStation's Orders grid; usable in filter and automation-rule criteria |
| CustomField2 | `Orders/Order/CustomField2` | 1 per Order | String | 0…100 | Custom Field 2 |
| CustomField3 | `Orders/Order/CustomField3` | 1 per Order | String | 0…100 | Custom Field 3 |
| RequestedWarehouse | `Orders/Order/RequestedWarehouse` | 1 per Order | String | 0…100 | Ship From Location (must match the warehouse Name) |
| Source | `Orders/Order/Source` | 1 per Order | String | 0…50 | Order source (e.g. eBay, Amazon, Buy.com) |
| Customer `*` | `Orders/Order/Customer` | 1 per Order | Container | n/a | Container for the customer's information |
| CustomerCode `*` | `Orders/Order/Customer/CustomerCode` | 1 per Order | String | 1…50 | Unique identifier of the customer in your system — often a username or email address |
| BillTo `*` | `Orders/Order/Customer/BillTo` | 1 per Order | Container | n/a | Container for the customer's billing information |
| Name `*` | `Orders/Order/Customer/BillTo/Name` | 1 per Order | String | 1…100 | Billing name |
| Company | `Orders/Order/Customer/BillTo/Company` | 1 per Order | String | 1…100 | Billing company |
| Phone | `Orders/Order/Customer/BillTo/Phone` | 1 per Order | String | 0…50 | Billing phone |
| Email | `Orders/Order/Customer/BillTo/Email` | 1 per Order | String | 0…100 | Recommended, so ShipStation can notify the buyer when an order ships |
| ShipTo `*` | `Orders/Order/Customer/ShipTo` | 1 per Order | Container | n/a | Container for the customer's shipping information |
| Name `*` | `Orders/Order/Customer/ShipTo/Name` | 1 per Order | String | 1…100 | Recipient's name |
| Company | `Orders/Order/Customer/ShipTo/Company` | 1 per Order | String | 1…100 | Recipient's company |
| Address1 `*` | `Orders/Order/Customer/ShipTo/Address1` | 1 per Order | String | 1…200 | Recipient's address line 1 |
| Address2 | `Orders/Order/Customer/ShipTo/Address2` | 1 per Order | String | 1…200 | Recipient's address line 2 |
| City `*` | `Orders/Order/Customer/ShipTo/City` | 1 per Order | String | 1…100 | Recipient's city |
| State `*` | `Orders/Order/Customer/ShipTo/State` | 1 per Order | String | 2…100 | US and Canadian addresses require the 2-character state/territory code |
| PostalCode `*` | `Orders/Order/Customer/ShipTo/PostalCode` | 1 per Order | String | 0…50 | Required for domestic addresses and many international addresses |
| Country `*` | `Orders/Order/Customer/ShipTo/Country` | 1 per Order | String | 2 | 2-character ISO 3166-1 country code |
| Phone | `Orders/Order/Customer/ShipTo/Phone` | 1 per Order | String | 0…50 | Required in some cases (e.g. overnight or international shipping). No specific format. |
| Items `*` | `Orders/Order/Items` | 1 per Order | Container | | Container for the order's items |
| Item | `Orders/Order/Items/Item` | Unlimited | Container | | Container for an individual order line item |
| LineItemID | `Orders/Order/Items/Item/LineItemID` | 1 per Item | String | 1…50 | Unique identifier for the line item |
| SKU `*` | `Orders/Order/Items/Item/SKU` | 1 per Item | String | 1…50 | Unique identifier for the product ordered |
| Name `*` | `Orders/Order/Items/Item/Name` | 1 per Item | String | 1…200 | Name of the product |
| ImageUrl | `Orders/Order/Items/Item/ImageUrl` | 1 per Item | String | 0…500 | URL for the product's image |
| Weight | `Orders/Order/Items/Item/Weight` | 1 per Item | Decimal | 9,2 | Weight of a **single** line item |
| WeightUnits | `Orders/Order/Items/Item/WeightUnits` | 1 per Item | Enum | | One of: `Pounds`, `Ounces`, `Grams` |
| Quantity `*` | `Orders/Order/Items/Item/Quantity` | 1 per Item | Integer | 1…99999 | Quantity of items ordered |
| UnitPrice `*` | `Orders/Order/Items/Item/UnitPrice` | 1 per Item | Decimal | 9,2 | Price of a single item |
| UPC | `Orders/Order/Items/Item/UPC` | 1 per Item | String | 0–12 | 12-digit numeric barcode identifying an individual retail product |
| Location | `Orders/Order/Items/Item/Location` | 1 per Item | String | 0…100 | Location of the product in the warehouse |
| Adjustment | `Orders/Order/Items/Item/Adjustment` | 1 per Item | Bool | | `true` if the line item is a coupon, discount, or other adjustment. **Any adjustment line item must have a negative `UnitPrice`.** |
| Options | `Orders/Order/Items/Item/Options` | 1 per Item | Container | | Container for item options (color, size, etc.) |
| Option | `Orders/Order/Items/Item/Options/Option` | 10 per Item | Container | | Container for an individual option value |
| Name `*` | `Orders/Order/Items/Item/Options/Option/Name` | 1 per Option | String | 1…100 | Name of the option (e.g. Size) |
| Value `*` | `Orders/Order/Items/Item/Options/Option/Value` | 1 per Option | String | 1…100 | Value of the option (e.g. XL) |
| Weight | `Orders/Order/Items/Item/Options/Option/Weight` | 1 per Option | Decimal | 9,2 | Additional weight the option adds, in the units given by `WeightUnits`. Should be the additional weight for a single quantity. |

> **Doc inconsistencies to watch for.** The published article lists `Option` as "10 per Item" in
> the field table while the XSD allows `maxOccurs="100"`; it lists `SKU` as max length 50 in the
> field table and `String100` in the XSD; and the XSD marks `OrderID` as `minOccurs="0"` while the
> field table marks it required. Where the two disagree, the stricter of the two is the safer
> target.

---

## 6. XML schema for validating order information

Order XML is validated against this schema:

```xml
<xs:schema attributeFormDefault="unqualified" elementFormDefault="qualified" xmlns:xs="http://www.w3.org/2001/XMLSchema">
 <xs:element name="Orders">
  <xs:complexType>
   <xs:sequence>
    <xs:element name="Order" maxOccurs="unbounded" minOccurs="0">
     <xs:complexType>
      <xs:all>
       <xs:element type="String50" name="OrderID" minOccurs="0"/>
       <xs:element type="String50" name="OrderNumber"/>
       <xs:element type="DateTime" name="OrderDate"/>
       <xs:element type="String50" name="OrderStatus"/>
       <xs:element type="DateTime" name="LastModified"/>
       <xs:element type="String100" name="ShippingMethod" minOccurs="0"/>
       <xs:element type="String50" name="PaymentMethod" minOccurs="0"/>
       <xs:element type="xs:decimal" name="OrderTotal"/>
       <xs:element type="xs:decimal" name="TaxAmount" minOccurs="0"/>
       <xs:element type="xs:decimal" name="ShippingAmount" minOccurs="0"/>
       <xs:element type="String1000" name="CustomerNotes" minOccurs="0"/>
       <xs:element type="String1000" name="InternalNotes" minOccurs="0"/>
       <xs:element type="xs:boolean" name="Gift" minOccurs="0"/>
       <xs:element type="String1000" name="GiftMessage" minOccurs="0"/>
       <xs:element type="String100" name="CustomField1" minOccurs="0"/>
       <xs:element type="String100" name="CustomField2" minOccurs="0"/>
       <xs:element type="String100" name="CustomField3" minOccurs="0"/>
       <xs:element type="String100" name="RequestedWarehouse" minOccurs="0"/>
       <xs:element type="String50" name="Source" minOccurs="0" />
       <xs:element name="Customer">
         <xs:complexType>
          <xs:all>
           <xs:element type="String100" name="CustomerCode"/>
           <xs:element name="BillTo">
             <xs:complexType>
              <xs:all>
               <xs:element type="String100" name="Name"/>
               <xs:element type="String100" name="Company" minOccurs="0"/>
               <xs:element type="String50" name="Phone" minOccurs="0"/>
               <xs:element type="Email" name="Email" minOccurs="0"/>
               <xs:element type="String200" name="Address1" minOccurs="0"/>
               <xs:element type="String200" name="Address2" minOccurs="0"/>
               <xs:element type="String100" name="City" minOccurs="0"/>
               <xs:element type="String100" name="State" minOccurs="0"/>
               <xs:element type="String50" name="PostalCode" minOccurs="0"/>
               <xs:element type="StringExactly2" name="Country" minOccurs="0"/>
              </xs:all>
             </xs:complexType>
           </xs:element>
           <xs:element name="ShipTo">
            <xs:complexType>
              <xs:all>
               <xs:element type="String100" name="Name"/>
               <xs:element type="String100" name="Company" minOccurs="0"/>
               <xs:element type="String200" name="Address1"/>
               <xs:element type="String200" name="Address2" minOccurs="0"/>
               <xs:element type="String100" name="City"/>
               <xs:element type="String100" name="State" minOccurs="0"/>
               <xs:element type="String50" name="PostalCode" minOccurs="1"/>
               <xs:element type="StringExactly2" name="Country"/>
               <xs:element type="String50" name="Phone" minOccurs="0"/>
            </xs:all>
           </xs:complexType>
          </xs:element>
         </xs:all>
        </xs:complexType>
       </xs:element>
       <xs:element name="Items">
        <xs:complexType>
          <xs:sequence>
           <xs:element name="Item" maxOccurs="unbounded" minOccurs="0">
            <xs:complexType>
              <xs:all>
               <xs:element type="String50" name="LineItemID" minOccurs="0"/>
               <xs:element type="String100" name="SKU"/>
               <xs:element type="String200" name="Name"/>
               <xs:element type="xs:boolean" name="Adjustment" minOccurs="0"/>
               <xs:element type="xs:anyURI" name="ImageUrl" minOccurs="0"/>
               <xs:element type="xs:decimal" name="Weight" minOccurs="0"/>
               <xs:element name="WeightUnits" minOccurs="0">
               <xs:simpleType>
               <xs:restriction base="xs:string">
               <xs:pattern value="pound|pounds|lb|lbs|gram|grams|gm|oz|ounces|Pound|Pounds|Lb|Lbs|Gram|Grams|Gm|Oz|Ounces|POUND|POUNDS|LB|LBS|GRAM|GRAMS|GM|OZ|OUNCES"/>
              </xs:restriction>
             </xs:simpleType>
            </xs:element>
            <xs:element type="xs:int" name="Quantity"/>
            <xs:element type="xs:decimal" name="UnitPrice"/>
            <xs:element type="String100" name="Location" minOccurs="0"/>
            <xs:element name="Options" minOccurs="0">
              <xs:complexType>
                <xs:sequence>
                  <xs:element name="Option" maxOccurs="100" minOccurs="0">
                    <xs:complexType>
                      <xs:all>
                        <xs:element type="String100" name="Name"/>
                        <xs:element type="String100" name="Value"/>
                        <xs:element type="xs:decimal" name="Weight" minOccurs="0"/>
                     </xs:all>
                    </xs:complexType>
                   </xs:element>
                 </xs:sequence>
                </xs:complexType>
               </xs:element>
              </xs:all>
             </xs:complexType>
            </xs:element>
           </xs:sequence>
          </xs:complexType>
         </xs:element>
        </xs:all>
       </xs:complexType>
      </xs:element>
     </xs:sequence>
     <xs:attribute type="xs:short" name="pages"/>
    </xs:complexType>
   </xs:element>
   <xs:simpleType name="DateTime">
    <xs:restriction base="xs:string">
     <xs:pattern value="[0-9][0-9]?/[0-9][0-9]?/[0-9][0-9][0-9]?[0-9]? [0-9][0-9]?:[0-9][0-9]?:?[0-9]?[0-9]?. ?[aApP]?[mM]?"/>
  </xs:restriction>
 </xs:simpleType>
 <xs:simpleType name="Email">
  <xs:restriction base="xs:string">
  </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="StringExactly2">
   <xs:restriction base="xs:string">
    <xs:minLength value="2"/>
    <xs:maxLength value="2"/>
   </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="String30">
    <xs:restriction base="xs:string">
      <xs:maxLength value="30"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="String50">
    <xs:restriction base="xs:string">
      <xs:maxLength value="50"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="String100">
    <xs:restriction base="xs:string">
      <xs:maxLength value="100"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="String200">
    <xs:restriction base="xs:string">
      <xs:maxLength value="200"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="String1000">
    <xs:restriction base="xs:string">
      <xs:maxLength value="1000"/>
    </xs:restriction>
  </xs:simpleType>
</xs:schema>
```

Two things worth pulling out of the XSD:

- **`xs:all` everywhere.** Each element may appear at most once within its parent, but order does
  not matter — except inside `Items` and `Options`, which use `xs:sequence` and are repeatable.
- **The `DateTime` pattern is loose.** It accepts `M/d/yyyy H:mm` with optional seconds and an
  optional AM/PM marker. `10/18/2019 21:56 PM` from ShipStation's own example is nonsense as a
  time but still matches the pattern.
- **`WeightUnits` accepts far more than the three documented values** — the pattern allows
  `lb`, `lbs`, `oz`, `gm`, and case variants. Stick to `Pounds` / `Ounces` / `Grams`.

---

## 7. Reference — ShipNotify fields

| Name | XPath | Max occurrence | Type | Length | Description |
|---|---|---|---|---|---|
| ShipNotice | `ShipNotice` | 1 | Container | n/a | Root node |
| OrderID | `ShipNotice/OrderID` | 1 | String | 1…50 | Unique identifier for an order |
| OrderNumber | `ShipNotice/OrderNumber` | 1 | String | 1…50 | User-visible order identifier |
| CustomerCode | `ShipNotice/CustomerCode` | 1 | String | 1…50 | Unique identifier of the customer in your system — often a username or email address |
| CustomerNotes | `ShipNotice/CustomerNotes` | 1 | String | 0…1000 | Notes left by the customer when placing the order |
| InternalNotes | `ShipNotice/InternalNotes` | 1 | String | 0…1000 | Private notes viewed only by your company |
| NotesToCustomer | `ShipNotice/NotesToCustomer` | 1 | String | 0…1000 | Public notes to be communicated to the customer |
| NotifyCustomer | `ShipNotice/NotifyCustomer` | 1 | Bool | | If ShipStation sent the customer a shipment notification email, this value will be `false`. |
| LabelCreateDate | `ShipNotice/LabelCreateDate` | 1 | Date/time | | Date the shipping label was created. UTC. Format `MM/dd/yyyy HH:mm`. |
| ShipDate | `ShipNotice/ShipDate` | 1 | Date | | Date the package will be shipped |
| Carrier | `ShipNotice/Carrier` | 1 | String | 0…50 | Shipping carrier used (USPS, UPS, FedEx) |
| Service | `ShipNotice/Service` | 1 | String | 0…50 | Shipping service used |
| TrackingNumber | `ShipNotice/TrackingNumber` | 1 | String | 0…50 | The package's tracking number |
| ShippingCost | `ShipNotice/ShippingCost` | 1 | Decimal | 9,2 | Cost to ship the package |
| Recipient | `ShipNotice/Recipient` | 1 | Container | n/a | Container for the recipient's address |
| Name | `ShipNotice/Recipient/Name` | 1 | String | 1…100 | Recipient's name |
| Company | `ShipNotice/Recipient/Company` | 1 | String | 0…100 | Recipient's company |
| Address1 | `ShipNotice/Recipient/Address1` | 1 | String | 1…200 | Recipient's address line 1 |
| Address2 | `ShipNotice/Recipient/Address2` | 1 | String | 1…200 | Recipient's address line 2 |
| City | `ShipNotice/Recipient/City` | 1 | String | 0…100 | Recipient's city |
| State | `ShipNotice/Recipient/State` | 1 | String | | US and Canadian addresses require the 2-character state/territory code |
| PostalCode | `ShipNotice/Recipient/PostalCode` | 1 | String | 0…50 | Required for domestic addresses and many international addresses |
| Country | `ShipNotice/Recipient/Country` | 1 | String | 2 | 2-character country code |
| Items | `ShipNotice/Items` | 1 | Container | | Container for the shipment's items |
| Item | `ShipNotice/Items/Item` | Unlimited | Container | | Container for an individual shipment line item |
| LineItemID | `ShipNotice/Items/Item/LineItemID` | 1 per Item | String | 1…50 | Unique identifier for the line item |
| SKU | `ShipNotice/Items/Item/SKU` | 1 per Item | String | 1…100 | Unique identifier for the product shipped |
| Name | `ShipNotice/Items/Item/Name` | 1 per Item | String | 1…200 | Name of the product |
| Quantity | `ShipNotice/Items/Item/Quantity` | 1 per Item | Integer | 1…99999 | Quantity of items shipped |

The published article does not document the `CustomField1`–`CustomField3` elements that appear in
its own ShipNotice example; they carry back the custom field values sent on export.

---

## How this maps to our implementation

We already have a Custom Store endpoint. This section is the map from spec to code.

> **This surface is the chosen order channel.** The deviations listed below are a live backlog,
> not trivia: each one is a place our implementation contradicts the spec above, and the spec wins.

| Spec concept | Where it lives |
|---|---|
| The web endpoint (both `action=export` and shipnotify) | `src/app/api/shipstation/orders/route.ts` — exports `GET` and `POST` |
| Basic auth validation | `src/lib/shipstation/auth.ts` — `authenticateShipStationMulti()`, `logAuthAttempt()` |
| Order XML generation | `src/lib/shipstation/xmlBuilder.ts` — `exportOrdersToXML(orders, page, totalPages)` |
| ShipNotice XML parsing | `src/lib/shipstation/xmlParser.ts` — `parseShipmentNotification()`, `validateShipmentNotification()` |
| XML element typings | `src/lib/shipstation/xmlTypes.ts` |
| Date formatting, CDATA, money/weight, status mapping | `src/lib/shipstation/utils.ts` |
| Per-store credential storage | `store_integrations` table (`shipstation_username`, `shipstation_password_hash`, `shipstation_auth_enabled`) |
| Admin connection UI | `src/app/admin/integrations/shipstation/page.tsx` |

Implementation details worth knowing before changing anything:

- **Multi-tenant.** Auth resolves an incoming Basic auth credential to a `store_id`, so one URL
  serves every merchant's store. A `404` comes back when credentials authenticate but map to no
  store.
- **Paging.** The route accepts a non-standard `page_size` parameter (default `50`) alongside
  ShipStation's `page`, and reports `Math.ceil(total / pageSize)` in the `pages` attribute.
- **Export window filters on `orders.updated_at`**, which is the correct "last modified" semantic
  from §2.
- **Export excludes cancelled and refunded orders** (`AND o.status NOT IN ('cancelled',
  'refunded')`). The spec says to return orders modified in the window *regardless of status*, so
  an order cancelled after import will not appear in a later export and ShipStation will not learn
  about the cancellation from us. Deliberate or not, it is a deviation from the spec — do not rely
  on cancellation propagating through this feed.
- **Errors are returned as JSON**, not XML (`formatShipStationError` with
  `Content-Type: application/json`). Successful exports return
  `Content-Type: application/xml; charset=utf-8`.

Related: `src/lib/shipstation/CLAUDE.md` for the rules governing that directory,
`docs/audits/shipstation-audit.md` for a review of the integration, and `docs/payments.md` for the
`orders` / `order_items` schema the export reads from.

Note this endpoint is the *opposite* direction from the background sync described in `CLAUDE.md`
(→ Background Sync System), which **pulls** products and inventory *from* ShipStation's REST API.
The Custom Store makes us a source ShipStation pulls orders *from* over XML.
